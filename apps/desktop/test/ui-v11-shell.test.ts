import { describe, expect, it } from "vitest";
import type { RuntimeSnapshot } from "../src/shared/bridge.js";
import { runtimeStatusLine } from "../src/renderer/lib/runtime-status.js";
import { costHintText, stepsFromTimeline } from "../src/renderer/lib/run-steps.js";
import { SIZE_GROUPS, sizeDims } from "../src/renderer/lib/composer-sizes.js";
import { readAutoRefinePref, writeAutoRefinePref, readResearchPref, writeResearchPref } from "../src/renderer/lib/composer-prefs.js";

/**
 * UI v1.1 R1 — the sidebar status card replaces the runtime panel that used to sit
 * under the Home composer. Its one line must stay honest: Trial never reads as
 * "ready", and a broken runtime names what is missing.
 */

function snap(state: "ready" | "not_logged_in" | "missing", effective: "mock" | "codex", loginMethod: "chatgpt" | "api-key" | null = "chatgpt"): RuntimeSnapshot {
  return { runtime: { state, source: "bundled", bin: "/x/codex", loginMethod }, providersMode: "auto", effective };
}

describe("runtimeStatusLine", () => {
  it("a ready Codex says so, with the login it uses", () => {
    expect(runtimeStatusLine(snap("ready", "codex"), false)).toEqual({ tone: "ok", title: "Codex", detail: "ready · ChatGPT" });
    expect(runtimeStatusLine(snap("ready", "codex", "api-key"), false).detail).toBe("ready · API key");
  });

  it("Trial wins over a ready runtime — placeholder images are never labeled ready", () => {
    expect(runtimeStatusLine(snap("ready", "mock"), true)).toEqual({ tone: "warn", title: "Trial mode", detail: "placeholder images" });
    expect(runtimeStatusLine(snap("ready", "codex"), true).title).toBe("Trial mode"); // provider says mock even if the snapshot lags
  });

  it("a broken runtime names what is missing", () => {
    expect(runtimeStatusLine(snap("not_logged_in", "codex"), false)).toEqual({ tone: "bad", title: "Codex", detail: "sign in needed" });
    expect(runtimeStatusLine(snap("missing", "codex"), false)).toEqual({ tone: "bad", title: "Codex", detail: "not installed" });
  });
});

/**
 * UI v1.1 R3 — the progress line and cost hint shared by every metered flow. The
 * agent's internal role names must never reach a seller, and the cost hint must
 * not show a price in Trial (nothing is billed) except the multi-page contract
 * label C1 pins.
 */
describe("stepsFromTimeline", () => {
  it("maps agent roles to seller words and runs only the first unfinished step", () => {
    const steps = stepsFromTimeline([
      { content: "Designer Agent", done: true },
      { content: "Image Generator", done: false },
      { content: "Manager Agent", done: false },
    ]);
    expect(steps).toEqual([
      { label: "Planning", state: "done" },
      { label: "Painting", state: "running" },
      { label: "Composing", state: "pending" },
    ]);
  });

  it("an unknown role passes through instead of vanishing", () => {
    expect(stepsFromTimeline([{ content: "Layout Checker", done: false }])).toEqual([{ label: "Layout Checker", state: "running" }]);
  });
});

describe("costHintText", () => {
  it("multi-page keeps C1's contract label, Trial or not", () => {
    expect(costHintText({ images: 1, pages: 2, isMock: true })).toBe("2 pages ≈ 2 images");
    expect(costHintText({ images: 1, pages: 3, isMock: false })).toBe("3 pages ≈ 3 images");
  });

  it("a single paid image shows its cost; Trial shows none", () => {
    expect(costHintText({ images: 1, isMock: false })).toBe("≈ 1 image");
    expect(costHintText({ images: 1, reads: 1, isMock: false })).toBe("≈ 1 image + 1 read");
    expect(costHintText({ images: 1, pages: 1, isMock: true })).toBeNull();
  });
});

describe("DA-5: the Auto refine cost label is a display law", () => {
  it("loop ON shows the worst-case images + reads — Trial included (it previews the real bill)", () => {
    expect(costHintText({ images: 1, isMock: true, autoRefineRounds: 1 })).toBe("Auto refine on · up to 2 images + 2 reads");
    expect(costHintText({ images: 1, isMock: false, autoRefineRounds: 1 })).toBe("≈ 1 image · Auto refine on · up to 2 images + 2 reads");
  });
  it("multi-page keeps C1's contract label AND adds the per-page worst case", () => {
    expect(costHintText({ images: 1, pages: 3, isMock: false, autoRefineRounds: 1 })).toBe("3 pages ≈ 3 images · Auto refine on · up to 6 images + 6 reads");
  });
  it("loop OFF → the label disappears entirely (rounds 0 = absent)", () => {
    expect(costHintText({ images: 1, isMock: false, autoRefineRounds: 0 })).toBe("≈ 1 image");
    expect(costHintText({ images: 1, isMock: true })).toBeNull();
  });
});

describe("DA-4: composer prefs — auto refine defaults ON (owner Q1), research defaults OFF (S1.5)", () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v), dump: () => m };
  };
  it("absent/corrupt keys restore the DECIDED defaults — a broken key never flips an owner decision", () => {
    const s = store();
    expect(readAutoRefinePref(s as unknown as Storage)).toBe(true); // AUTO_REFINE_DEFAULT
    expect(readResearchPref(s as unknown as Storage)).toBe(false); // S1.5
    s.setItem("oia.autoRefine", "garbage");
    expect(readAutoRefinePref(s as unknown as Storage)).toBe(true);
  });
  it("the switch choice persists both ways (OC-6)", () => {
    const s = store();
    writeAutoRefinePref(false, s as unknown as Storage);
    expect(readAutoRefinePref(s as unknown as Storage)).toBe(false);
    writeResearchPref(true, s as unknown as Storage);
    expect(readResearchPref(s as unknown as Storage)).toBe(true);
  });
});

/** UI v1.1 R6 (completing) — the composer size pill groups platform presets the
 *  Create-sheet way; the same key must resolve to the same pixels everywhere. */
describe("composer size resolution", () => {
  const ratios: Record<string, [number, number] | null> = {
    auto: null, "1:1": [1024, 1024], "9:16": [1080, 1920], "16:9": [1920, 1080],
  };

  it("auto and plain ratios keep their old meaning", () => {
    expect(sizeDims("auto", ratios)).toBeNull();
    expect(sizeDims("1:1", ratios)).toEqual([1024, 1024]);
  });

  it("a platform preset resolves to the Create sheet's exact pixels", () => {
    expect(sizeDims("shopee-1x1", ratios)).toEqual([1024, 1024]); // SIZE_PRESETS["Shopee Product (1:1)"]
    expect(sizeDims("lazada-1x1", ratios)).toEqual([800, 800]); // Lazada's own spec, not a generic square
    expect(sizeDims("tiktok-916", ratios)).toEqual([1080, 1920]);
  });

  it("an unknown key falls to null so submit can use the provider default — never a silent wrong size", () => {
    expect(sizeDims("nope", ratios)).toBeNull();
  });

  it("every size group the Create sheet offers is offered in the composer menu", () => {
    expect(SIZE_GROUPS.map((g) => g.name)).toEqual(["Marketplace", "Social", "Livestream", "Other"]);
    const ids = SIZE_GROUPS.flatMap((g) => g.items.map((a) => a.id));
    expect(new Set(ids).size).toBe(ids.length); // ids are the select values — duplicates would corrupt the pill
    expect(SIZE_GROUPS.flatMap((g) => g.items).filter((a) => a.official).map((a) => a.label))
      .toEqual(["Shopee live cover", "TikTok live cover"]); // LV-10: only the two covers are official
  });
});
