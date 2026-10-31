import { describe, expect, it } from "vitest";
import type { SceneCanvas } from "@oia/schema";
import { appendVariant, bindPromptForJob, variantKey, variantsFromSession, type VariantCard } from "../src/renderer/lib/variant-tray.js";

/**
 * A1 preview-apply — the pure tray rules. The dedupe here is what the shot gate
 * counts on (exactly 1 card per canvas); the resume pairing is what
 * "reopening a conversation still shows the variants" (spec goal 5) stands on.
 */

const scene = (n: number): SceneCanvas => ({ version: "7.3.1", objects: [{ type: "Rect", name: "clip", left: 0, top: 0, width: 10 * n, height: 10, fill: "#fff", visible: true }] }) as SceneCanvas;

function card(key: string, prompt: string, canvas?: SceneCanvas): VariantCard {
  return { id: `id-${key}`, key, jobId: key.split(":")[0] ?? "", prompt, thumbnail: "", canvas: canvas ?? scene(1) };
}

describe("appendVariant — one canvas, one card (dedupe by key)", () => {
  it("re-emitting the same canvas (same jobId + metaId) does not grow the tray", () => {
    const a = appendVariant([], card("job1:c1", "pastel"));
    const again = appendVariant(a, card("job1:c1", "pastel"));
    expect(again).toBe(a); // same reference — not even a re-render
    expect(again).toHaveLength(1);
  });

  it("a different canvas in the same job (multi-page) DOES append", () => {
    const a = appendVariant(appendVariant([], card("job1:c1", "deck")), card("job1:c2", "deck"));
    expect(a).toHaveLength(2);
  });

  it("the same metaId across different jobs are different canvases", () => {
    const a = appendVariant(appendVariant([], card("job1:c1", "a")), card("job2:c1", "b"));
    expect(a).toHaveLength(2);
  });

  it("variantKey treats a missing jobId deterministically (empty-string namespace)", () => {
    expect(variantKey(undefined, "x")).toBe(":x");
    expect(variantKey(undefined, "x")).toBe(variantKey("", "x"));
  });
});

describe("bindPromptForJob — a card never shows a newer job's prompt (B7)", () => {
  it("the first event binds the prompt submitted for that job; late events keep it", () => {
    const map = new Map<string, string>();
    expect(bindPromptForJob(map, "jobA", "edit one")).toBe("edit one");
    // user submits a second edit before jobA's final canvas event lands
    expect(bindPromptForJob(map, "jobA", "edit two")).toBe("edit one"); // stays honest
    expect(bindPromptForJob(map, "jobB", "edit two")).toBe("edit two");
  });

  it("an empty submitted prompt is a valid binding (never rebinds to a later one)", () => {
    const map = new Map<string, string>();
    expect(bindPromptForJob(map, "j", "")).toBe("");
    expect(bindPromptForJob(map, "j", "later")).toBe("");
  });
});

describe("variantsFromSession — resume shows the conversation's canvases", () => {
  it("pairs each assistant canvas with the user prompt right before it", () => {
    const cards = variantsFromSession(7, [
      { role: "user", content: "edit one" },
      { role: "assistant", content: "done", canvas: scene(1), renderData: { msgMeta: [{ type: "canvas", id: "x", thumbnail: "/api/files/t1.png" }] } },
      { role: "user", content: "edit two" },
      { role: "assistant", content: "done", canvas: scene(2) },
      { role: "assistant", content: "no canvas here" },
    ]);
    expect(cards).toHaveLength(2);
    expect(cards[0].prompt).toBe("edit one");
    expect(cards[0].thumbnail).toBe("/api/files/t1.png");
    expect(cards[1].prompt).toBe("edit two");
    expect(cards[1].thumbnail).toBe(""); // no renderData → ScenePreview fallback
  });

  it("resume keys cannot collide with live jobId:metaId keys", () => {
    const cards = variantsFromSession(7, [{ role: "user", content: "p" }, { role: "assistant", canvas: scene(1) }]);
    expect(cards[0].key).toBe("resume:7:0");
    expect(appendVariant(cards, card("resume:7:0", "live"))).toBe(cards); // deduped, no phantom
  });

  it("a leading assistant canvas with no user prompt gets an empty prompt (never a wrong one)", () => {
    const cards = variantsFromSession(9, [{ role: "assistant", canvas: scene(1) }]);
    expect(cards).toHaveLength(1);
    expect(cards[0].prompt).toBe("");
  });
});
