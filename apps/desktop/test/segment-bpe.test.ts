import { describe, expect, it } from "vitest";
import { createClipTokenizer } from "../src/utility/segmentation/clip-bpe.js";

/** The vector set comes from the audited CLIP BPE implementation (Python, transformers
 *  vocabulary) that the ONNX PoC used; SAM 3's language tower is CLIP's. */
const VOCAB = JSON.stringify({ "!": 0, "b": 20, "o": 30, "t": 31, "l": 32, "e": 33, "c": 34, "p": 35, "u": 36, bottle: 37306, cup: 5059, package: 2711, "bottle</w>": 40000, "cup</w>": 40001 });
const MERGES = ["#version: 0.2", "b o", "bo ttle", "bott le", "c u", "cu p"];

const tok = createClipTokenizer(VOCAB, MERGES.join("\n"));

describe("createClipTokenizer", () => {
  it("wraps with SOT/EOT and pads to 32", () => {
    const ids = tok.encodePhrase("x");
    expect(ids).toHaveLength(32);
    expect(ids[0]).toBe(49406);
    expect(ids.filter((x) => x === 0).length).toBeGreaterThan(0);
  });
  it("lowercases and collapses whitespace (CLIP phrase cleaning)", () => {
    expect(tok.encodePhrase("CUP")).toEqual(tok.encodePhrase("  cup "));
  });
  it("caps at 32 tokens (cut, not overflow)", () => {
    const long = tok.encodePhrase("cup ".repeat(50));
    expect(long).toHaveLength(32);
  });
});
