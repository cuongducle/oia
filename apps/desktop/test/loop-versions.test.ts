import { describe, it, expect } from "vitest";
import { mergeVersion, type VersionSlot } from "../src/renderer/lib/loop-versions.js";

const flat = (n: number) => ({ dataUrl: `data:image/png;base64,${n}`, width: 100 + n, height: 200 + n });

function seed(...entries: { label: string; jobId: string | null }[]): VersionSlot[] {
  return entries.map((e) => ({ ...flat(0), ...e }));
}

describe("SIL mergeVersion, one slot per job", () => {
  it("a generate on an empty stack labels Generated", () => {
    const out = mergeVersion([], flat(1), "job-a", "generate");
    expect(out).toHaveLength(1);
    expect(out[0].label).toBe("Generated");
    expect(out[0].jobId).toBe("job-a");
  });

  it("auto-refine re-yields of the SAME job replace the slot, label survives", () => {
    let out = mergeVersion([], flat(1), "job-a", "generate");
    out = mergeVersion(out, flat(2), "job-a", "generate");
    out = mergeVersion(out, flat(3), "job-a", "generate");
    expect(out).toHaveLength(1);
    expect(out[0].dataUrl).toBe(flat(3).dataUrl);
    expect(out[0].label).toBe("Generated");
  });

  it("an edit job pushes a NEW slot counted by stack size (Edit N)", () => {
    let out = mergeVersion([], flat(1), "job-a", "generate");
    out = mergeVersion(out, flat(2), "job-b", "edit");
    expect(out).toHaveLength(2);
    expect(out[1].label).toBe("Edit 1");
    out = mergeVersion(out, flat(3), "job-c", "edit");
    expect(out[2].label).toBe("Edit 2");
  });

  it("a null jobId never replaces the previous slot (cannot prove ownership)", () => {
    let out = mergeVersion([], flat(1), "job-a", "generate");
    out = mergeVersion(out, flat(2), null, "generate");
    expect(out).toHaveLength(2);
    expect(out[1].jobId).toBeNull();
  });

  it("a second generate also replaces within its own job, keeps its own label", () => {
    let out = mergeVersion([], flat(1), "job-a", "generate");
    out = mergeVersion(out, flat(2), "job-b", "edit");
    out = mergeVersion(out, flat(3), "job-c", "generate");
    out = mergeVersion(out, flat(4), "job-c", "generate");
    expect(out).toHaveLength(3);
    expect(out[2].label).toBe("Generated");
    expect(out[2].dataUrl).toBe(flat(4).dataUrl);
  });
});
