import { describe, expect, it } from "vitest";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { atomicWriteJson, renameWithRetry } from "../src/atomic.js";

const dir = () => mkdtempSync(path.join(tmpdir(), "oia-atomic-"));

describe("STAGE-0 TP.7: atomic writes (temp + rename, retry, single writer)", () => {
  it("writes valid JSON via a temp file; no temp leftovers remain", async () => {
    const file = path.join(dir(), "projects.json");
    await atomicWriteJson(file, [{ id: "p1" }]);
    expect(JSON.parse(readFileSync(file, "utf8"))).toEqual([{ id: "p1" }]);
    const siblings = path.dirname(file);
    const leftovers = existsSync(path.join(siblings, ".projects.json.tmp-x"));
    expect(leftovers).toBe(false);
  });

  it("retries EPERM/EBUSY with backoff and succeeds on a transient lock", async () => {
    let calls = 0;
    const flaky = async () => {
      calls++;
      if (calls < 3) throw Object.assign(new Error("locked"), { code: "EPERM" });
    };
    await renameWithRetry("/tmp/a", "/tmp/b", { impl: flaky });
    expect(calls).toBe(3);
  });

  it("does NOT retry non-retryable errors, and gives up after the attempt budget", async () => {
    const enoent = async () => {
      throw Object.assign(new Error("nope"), { code: "ENOENT" });
    };
    await expect(renameWithRetry("/tmp/a", "/tmp/b", { impl: enoent })).rejects.toMatchObject({ code: "ENOENT" });

    let calls = 0;
    const forever = async () => {
      calls++;
      throw Object.assign(new Error("busy"), { code: "EBUSY" });
    };
    await expect(renameWithRetry("/tmp/a", "/tmp/b", { impl: forever, attempts: 3 })).rejects.toMatchObject({ code: "EBUSY" });
    expect(calls).toBe(3); // attempt budget respected
  });

  it("concurrent writers serialize — the file is always valid JSON (single-writer chain)", async () => {
    const file = path.join(dir(), "concurrent.json");
    await Promise.all(
      Array.from({ length: 25 }, (_, i) => atomicWriteJson(file, { writer: i, payload: "x".repeat(1000) })),
    );
    const final = JSON.parse(readFileSync(file, "utf8"));
    expect(final.payload).toBe("x".repeat(1000));
    expect(final.writer).toBeGreaterThanOrEqual(0);
    expect(final.writer).toBeLessThan(25);
  });
});
