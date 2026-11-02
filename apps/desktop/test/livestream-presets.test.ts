import { describe, expect, it } from "vitest";
import { sceneCanvasSchema, templateSchema } from "@oia/schema";
import {
  LIVE_ARTBOARDS,
  LIVE_GUIDES,
  LIVESTREAM_TEMPLATES,
  liveArtboardScene,
} from "../src/renderer/lib/livestream-presets.js";
import { GUIDE_DEFAULT, GUIDE_STORAGE_KEY, guideFor, guideRects, readGuidePref, writeGuidePref } from "../src/renderer/lib/live-guides.js";
import { ASPECT_TOLERANCE, isNineSixteen, sceneDims } from "../src/renderer/lib/scene-dims.js";

/** C3 — live overlay presets (live-overlay-presets.md). Gate 1: the data must
 * parse against the real schemas and keep its honesty invariants (official
 * only where a spec exists; templates live inside the safe band). */
describe("live artboard presets", () => {
  it("overlay preset is 9:16 transparent; covers are official and exact-spec", () => {
    const overlay = LIVE_ARTBOARDS.find((a) => a.id === "live-overlay-916")!;
    expect(overlay).toMatchObject({ w: 1080, h: 1920, transparent: true, official: false });
    expect(overlay.sub).not.toMatch(/require|platform spec/i);

    const shopee = LIVE_ARTBOARDS.find((a) => a.id === "shopee-live-cover")!;
    expect(shopee).toMatchObject({ w: 500, h: 500, transparent: false, official: true });

    const tiktok = LIVE_ARTBOARDS.find((a) => a.id === "tiktok-live-cover")!;
    expect(tiktok).toMatchObject({ w: 1080, h: 1920, transparent: false, official: true });

    // only the two covers may claim official — LV-10
    expect(LIVE_ARTBOARDS.filter((a) => a.official).map((a) => a.id).sort()).toEqual(["shopee-live-cover", "tiktok-live-cover"]);
  });

  it("scenes parse via sceneCanvasSchema; clip is the ground truth (TP.3)", () => {
    for (const a of LIVE_ARTBOARDS) {
      const scene = liveArtboardScene(a);
      expect(() => sceneCanvasSchema.parse(scene)).not.toThrow();
      const dims = sceneDims(scene);
      expect(dims).toEqual({ w: a.w, h: a.h });
      const fill = scene.objects[0].fill;
      expect(fill).toBe(a.transparent ? "transparent" : "white");
    }
  });
});

describe("livestream template pack", () => {
  // Textbox heights are auto-computed by fabric at render time, so the static
  // JSON carries no height — estimate fontSize × 1.2 per line or the band check
  // goes blind for text (a Textbox with height undefined would count as zero).
  const estHeight = (o: { type: string; fontSize?: number; text?: string; height?: number }): number => {
    if (typeof o.height === "number") return o.height;
    if (o.type === "Textbox") return (o.fontSize ?? 40) * 1.2 * String(o.text ?? "").split("\n").length;
    return 0;
  };

  it("every template parses, is categorized livestream, and is a transparent 9:16 artboard", () => {
    expect(LIVESTREAM_TEMPLATES.length).toBe(3);
    for (const t of LIVESTREAM_TEMPLATES) {
      expect(() => templateSchema.parse(t)).not.toThrow();
      expect(t.category).toBe("livestream");
      const clip = t.scene.objects[0];
      expect(clip).toMatchObject({ name: "clip", width: 1080, height: 1920, fill: "transparent" });
    }
  });

  it("templates are native text only — no image layer, nothing to download (LV-8)", () => {
    for (const t of LIVESTREAM_TEMPLATES) {
      expect(t.scene.objects.some((o) => o.type === "Image")).toBe(false);
      expect(t.scene.objects.some((o) => o.type === "Textbox")).toBe(true);
    }
  });

  it("all template content sits inside the TikTok safe band (top 130 … 1440 on 1920)", () => {
    const top = 130, bottom = 1920 - 480;
    for (const t of LIVESTREAM_TEMPLATES) {
      for (const o of t.scene.objects) {
        if (o.name === "clip") continue;
        expect((o.top ?? 0) + estHeight(o as never)).toBeLessThanOrEqual(bottom);
        expect(o.top ?? 0).toBeGreaterThanOrEqual(top);
      }
    }
  });

  it("no bare text on the transparent artboard — every label sits on a plate (teardown C3)", () => {
    // Bare colored text is invisible over real stream footage: the overlay's
    // actual backdrop is a video, not a checkerboard. Every Textbox must have a
    // plate Rect covering its position in the same template.
    for (const t of LIVESTREAM_TEMPLATES) {
      const plates = t.scene.objects.filter((o) => o.type === "Rect" && o.name !== "clip");
      const texts = t.scene.objects.filter((o) => o.type === "Textbox");
      for (const tb of texts) {
        const covered = plates.some((p) => {
          const pl = (p.left ?? 0), pt = (p.top ?? 0), pw = (p.width ?? 0), ph = (p.height ?? 0);
          const tl = (tb.left ?? 0), tt = (tb.top ?? 0), tw = (tb.width ?? 0);
          const th = estHeight(tb as never);
          return tl >= pl - 2 && tt >= pt - 2 && tl + tw <= pl + pw + 2 && tt + th <= pt + ph + 8;
        });
        expect(covered, `${t.id}: "${String(tb.text).slice(0, 24)}" floats on transparency`).toBe(true);
      }
    }
  });
});

describe("safe-zone data and guide math", () => {
  it("zone fractions are sane bands, not the whole canvas", () => {
    for (const g of Object.values(LIVE_GUIDES)) {
      expect(g.zones.length).toBeGreaterThanOrEqual(3);
      for (const z of g.zones) {
        expect(z.fraction).toBeGreaterThan(0);
        expect(z.fraction).toBeLessThan(0.35);
      }
      const top = g.zones.find((z) => z.edge === "top")!.fraction;
      const bottom = g.zones.find((z) => z.edge === "bottom")!.fraction;
      expect(top + bottom).toBeLessThan(0.6); // the safe band stays the majority of the stage
    }
  });

  it("tiktok carries measured confidence; shopee is labeled an estimate (LV-5)", () => {
    expect(guideFor("tiktok").confidence).toBe("measured");
    expect(guideFor("shopee").confidence).toBe("estimate");
    expect(guideFor("tiktok").note).toMatch(/no official overlay spec/i);
  });

  it("guideRects maps fractions to inside-canvas pixel rects per edge", () => {
    const rects = guideRects(LIVE_GUIDES.tiktok.zones, 1080, 1920);
    const byEdge = Object.fromEntries(rects.map((r) => [r.edge, r]));
    expect(byEdge.top).toEqual({ edge: "top", left: 0, top: 0, width: 1080, height: 130 });
    expect(byEdge.bottom).toMatchObject({ top: 1440, height: 480, width: 1080 });
    expect(byEdge.left).toEqual({ edge: "left", left: 0, top: 0, width: 60, height: 1920 });
    expect(byEdge.right).toMatchObject({ left: 960, width: 120 });
    for (const r of rects) {
      expect(r.left).toBeGreaterThanOrEqual(0);
      expect(r.top).toBeGreaterThanOrEqual(0);
      expect(r.left + r.width).toBeLessThanOrEqual(1080);
      expect(r.top + r.height).toBeLessThanOrEqual(1920);
    }
  });

  it("guideRects tolerates adversarial fractions without escaping the canvas", () => {
    const hostile = guideRects(
      [
        { edge: "top", fraction: 5 },
        { edge: "right", fraction: -1 },
      ],
      100,
      200,
    );
    expect(hostile[0]).toMatchObject({ height: 200 }); // clamped to full height, not 1000
    expect(hostile[1]).toMatchObject({ left: 100, width: 0 }); // negative → zero-width at the edge
  });
});

describe("9:16 eligibility (LV-6)", () => {
  it("accepts 1080×1920 and 9:16-ish within the shared tolerance", () => {
    expect(isNineSixteen(1080, 1920)).toBe(true);
    expect(isNineSixteen(900, 1600)).toBe(true);
    // ±5% boundary: exactly at tolerance passes, past it refuses
    expect(isNineSixteen(1080, Math.round(1920 / 1.05))).toBe(true);
    expect(isNineSixteen(1080, Math.round(1920 / (1 + ASPECT_TOLERANCE + 0.01)))).toBe(false);
  });

  it("refuses non-9:16 artboards — posters and covers never get a lying guide", () => {
    expect(isNineSixteen(1360, 2048)).toBe(false); // default blank artboard
    expect(isNineSixteen(900, 1200)).toBe(false); // studio samples (3:4)
    expect(isNineSixteen(500, 500)).toBe(false); // Shopee cover
    expect(isNineSixteen(0, 0)).toBe(false);
    expect(isNineSixteen(-1080, 1920)).toBe(false);
  });
});

describe("guide preference (OC-6 pattern)", () => {
  function store(initial: Map<string, string>): Pick<Storage, "getItem" | "setItem"> {
    return {
      getItem: (k: string) => initial.get(k) ?? null,
      setItem: (k: string, v: string) => void initial.set(k, v),
    };
  }

  it("round-trips every platform and defaults to off (LV-11)", () => {
    const s = store(new Map());
    expect(readGuidePref(s as never)).toBe(GUIDE_DEFAULT);
    for (const p of ["tiktok", "shopee", "off"] as const) {
      writeGuidePref(p, s as never);
      expect(readGuidePref(s as never)).toBe(p);
    }
    expect(s.getItem(GUIDE_STORAGE_KEY)).toBe("off");
  });

  it("garbage falls back to the default; throwing storage never blocks (LV-11)", () => {
    expect(readGuidePref(store(new Map([[GUIDE_STORAGE_KEY, "youtube"]])) as never)).toBe(GUIDE_DEFAULT);
    expect(readGuidePref(store(new Map([[GUIDE_STORAGE_KEY, ""]] )) as never)).toBe(GUIDE_DEFAULT);
    const throwing = { getItem: () => { throw new Error("denied"); }, setItem: () => { throw new Error("denied"); } };
    expect(readGuidePref(throwing)).toBe(GUIDE_DEFAULT);
    expect(() => writeGuidePref("shopee", throwing)).not.toThrow();
  });
});
