import { describe, expect, it } from "vitest";
import {
  addPage, editPage, movePage, outlineCostLabel, outlineRowsValid,
  readOutlineGatePref, removePage, writeOutlineGatePref,
  OUTLINE_GATE_DEFAULT, OUTLINE_MAX_PAGES, OUTLINE_STORAGE_KEY, type OutlineRow,
} from "../src/renderer/lib/outline-card.js";

/** C1 outline gate — the pure card model (docs/designs/outline-gate.md). */
const row = (title: string): OutlineRow => ({ title, summary: `${title} content` });
const two = [row("Cover"), row("Price")];

describe("row ops — edit/remove/add/move with hard bounds", () => {
  it("editPage patches one row copy-on-write; bad index is a no-op", () => {
    const next = editPage(two, 1, { title: "Deal" });
    expect(next[1].title).toBe("Deal");
    expect(next[1].summary).toBe("Price content"); // untouched key survives
    expect(two[1].title).toBe("Price"); // input not mutated
    expect(editPage(two, 9, { title: "x" })).toBe(two);
  });

  it("removePage never leaves zero pages (the deck always has one)", () => {
    expect(removePage(two, 0)).toEqual([row("Price")]);
    expect(removePage([row("only")], 0)).toEqual([row("only")]); // floor
  });

  it("addPage caps at the composer's 9-page ceiling", () => {
    let rows = two;
    for (let i = 0; i < 20; i++) rows = addPage(rows);
    expect(rows).toHaveLength(OUTLINE_MAX_PAGES);
  });

  it("movePage swaps neighbors and ignores out-of-range moves", () => {
    expect(movePage(two, 1, -1).map((r) => r.title)).toEqual(["Price", "Cover"]);
    expect(movePage(two, 0, -1)).toBe(two); // no-op returns the SAME reference
    expect(movePage(two, 1, 1)).toBe(two);
  });
});

describe("validity + cost label", () => {
  it("blank title or summary invalidates the deck (phase 2 would reject it anyway)", () => {
    expect(outlineRowsValid(two)).toBe(true);
    expect(outlineRowsValid([row("a"), { title: "  ", summary: "x" }])).toBe(false);
    expect(outlineRowsValid([{ title: "a", summary: "" }])).toBe(false);
  });

  it("the cost label is one source, singular/plural correct (OC-9)", () => {
    expect(outlineCostLabel(1)).toBe("1 page ≈ 1 image");
    expect(outlineCostLabel(3)).toBe("3 pages ≈ 3 images");
  });
});

describe("the gate preference (OC-6)", () => {
  const mem = (): Pick<Storage, "getItem" | "setItem"> & Record<string, string> => {
    const store: Record<string, string> = {};
    return {
      store,
      getItem: (k: string) => store[k] ?? null,
      setItem: (k: string, v: string) => { store[k] = v; },
    };
  };

  it("default ON is the owner decision (spec Q2) — a named constant", () => {
    expect(OUTLINE_GATE_DEFAULT).toBe(true);
    expect(readOutlineGatePref(mem())).toBe(true); // absent key → default
  });

  it("write then read round-trips; corrupt values fall back to the default", () => {
    const s = mem();
    writeOutlineGatePref(false, s);
    expect(s.store[OUTLINE_STORAGE_KEY]).toBe("off");
    expect(readOutlineGatePref(s)).toBe(false);
    s.store[OUTLINE_STORAGE_KEY] = "garbage";
    expect(readOutlineGatePref(s)).toBe(OUTLINE_GATE_DEFAULT);
  });

  it("write survives a throwing storage (private mode) without crashing", () => {
    expect(() => writeOutlineGatePref(true, { setItem: () => { throw new Error("denied"); } })).not.toThrow();
  });
});
