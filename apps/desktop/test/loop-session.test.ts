import { describe, it, expect } from "vitest";
import { loopSessionSchema } from "../src/shared/ipc.js";

/** The loop session file crosses a process boundary and survives restarts;
 * the schema is the only thing standing between a stale/corrupt file and the
 * restored view, so gate exactly the failure modes we fear. */
describe("SIL session schema, the corrupt-file gate", () => {
  const base = {
    versions: [
      { label: "Imported", jobId: null, dataUrl: "data:image/png;base64,AAAA", width: 1024, height: 1536 },
      { label: "Edit 1", jobId: "job-1", dataUrl: "data:image/png;base64,BBBB", width: 1024, height: 1536 },
    ],
    cursor: null,
    prompt: "banner for a phone case shop",
    marks: [
      { id: "m1", kind: "box", note: "warmer light", x: 10, y: 20, w: 100, h: 80 },
      { id: "m2", kind: "arrow", note: "", from: { x: 0, y: 0 }, to: { x: 5, y: 5 } },
    ],
  };

  it("accepts a full session (versions, cursor, prompt, marks)", () => {
    expect(loopSessionSchema.parse(base)).toBeTruthy();
  });

  it("rejects a non-image dataUrl (script-in-file)", () => {
    const bad = structuredClone(base);
    bad.versions[0].dataUrl = "data:text/html,<script>";
    expect(() => loopSessionSchema.parse(bad)).toThrow();
  });

  it("rejects more than 10 versions (cap must survive the wire)", () => {
    const bad = { ...base, versions: Array.from({ length: 11 }, () => base.versions[0]) };
    expect(() => loopSessionSchema.parse(bad)).toThrow();
  });

  it("rejects a cursor beyond the version stack", () => {
    expect(() => loopSessionSchema.parse({ ...base, cursor: 9 })).toThrow();
  });

  it("rejects unknown mark kinds", () => {
    const bad = structuredClone(base);
    // SAFETY: probing the discriminated union with a bogus kind is the test
    (bad.marks as { kind: string }[])[0].kind = "circle";
    expect(() => loopSessionSchema.parse(bad)).toThrow();
  });
});
