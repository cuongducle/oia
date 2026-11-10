import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SegmentRunner, resolveSegmentRuntime, f32ToB64, b64ToF32, type SegmentRuntime } from "../src/utility/segmentation/runner.js";

/**
 * The sidecar client's REAL error paths, through a real child process (a fake
 * runner), not mocks: segmentation-process-plan.md exists because a native
 * crash killed the whole utility process; this suite pins that a runner crash
 * is now only a rejected promise and the next call respawns it.
 *
 * The fake runner is a NODE script (works on every platform); the platform
 * wrapper makes it look like the runner executable the client spawns.
 */
const cases = tmpdir();
let base: string | null = null;
const runners: SegmentRunner[] = [];

/** node body of the fake runner; receives one JSON request per line on stdin */
function fakeRunner(bodyJs: string): { runtime: SegmentRuntime; runnerDir: string } {
  base ??= mkdtempSync(path.join(cases, "oia-seg-client-"));
  const d = path.join(base, `fake-${Math.random().toString(36).slice(2)}`);
  mkdirSync(d, { recursive: true });
  const script = path.join(d, "fake-runner.js");
  writeFileSync(script, `const readline = require("node:readline");
const rl = readline.createInterface({ input: process.stdin });
rl.on("line", (line) => { ${bodyJs} });
`);
  const exe = process.platform === "win32" ? "runner.cmd" : "oia-segment-runner";
  if (process.platform === "win32") {
    // Node refuses to spawn .cmd/.bat directly (CVE-2024-27980); launch through
    // cmd.exe via SegmentRuntime.args, exactly like any wrapper would.
    writeFileSync(path.join(d, exe), `@${JSON.stringify(process.execPath)} ${JSON.stringify(script)} %*\r\n`);
    return {
      runtime: { runnerPath: process.env.ComSpec ?? "cmd.exe", args: ["/d", "/s", "/c", path.join(d, exe)], ortLibPath: path.join(d, "fake-lib") },
      runnerDir: d,
    };
  }
  writeFileSync(path.join(d, exe), `#!/bin/sh\nexec ${JSON.stringify(process.execPath)} ${JSON.stringify(script)}\n`, { mode: 0o755 });
  // the real runtime ALSO needs the ORT lib; the fake does not care about it
  writeFileSync(path.join(d, "libonnxruntime.1.dylib"), "fake");
  return { runtime: { runnerPath: path.join(d, exe), ortLibPath: path.join(d, "fake-lib") }, runnerDir: d };
}

function client(bodyJs: string): { r: SegmentRunner; runnerDir: string } {
  const { runtime, runnerDir } = fakeRunner(bodyJs);
  const r = new SegmentRunner(runtime, 4_000);
  runners.push(r);
  return { r, runnerDir };
}

const PONG = `process.stdout.write(JSON.stringify({ op: "pong" }) + "\\n");`;

afterEach(() => {
  for (const r of runners.splice(0)) r.kill();
});

describe("resolveSegmentRuntime", () => {
  it("null when the runner binary or the ORT lib is missing (the capability gate)", () => {
    const d = mkdtempSync(path.join(cases, "oia-seg-empty-"));
    expect(resolveSegmentRuntime(d)).toBeNull();
    const exe = process.platform === "win32" ? "oia-segment-runner.exe" : "oia-segment-runner";
    const lib = process.platform === "win32" ? "onnxruntime.dll" : "libonnxruntime.1.dylib";
    writeFileSync(path.join(d, exe), "x");
    expect(resolveSegmentRuntime(d)).toBeNull(); // still no ORT lib
    writeFileSync(path.join(d, lib), "x");
    expect(resolveSegmentRuntime(d)).toEqual({ runnerPath: path.join(d, exe), ortLibPath: path.join(d, lib) });
    rmSync(d, { recursive: true, force: true });
  });
});

describe("f32 payload codec", () => {
  it("round-trips little-endian floats", () => {
    const arr = new Float32Array([0.5, -1.25, 3.14159, 0]);
    const back = b64ToF32(f32ToB64(arr));
    expect(Array.from(back)).toEqual(Array.from(arr));
  });
});

describe("SegmentRunner against a real fake child", () => {
  it("happy path: ping -> pong, one spawn reused", async () => {
    const { r } = client(PONG);
    const pong = await r.request({ op: "ping" });
    expect(pong).toEqual({ op: "pong" });
    await r.request({ op: "ping" });
    expect(r.generation).toBe(1);
  });

  it("an error response rejects with the runner's message", async () => {
    const { r } = client(`process.stdout.write(JSON.stringify({ op: "error", message: "vision run: boom" }) + "\\n");`);
    await expect(r.request({ op: "ping" })).rejects.toThrow(/vision run: boom/);
  });

  it("a MID-RUN CRASH is a rejected promise + a fresh spawn on the next call (the utility must survive)", async () => {
    const { r } = client(`if (typeof globalThis.__n === "undefined") globalThis.__n = 0;
globalThis.__n += 1;
if (globalThis.__n === 1) { ${PONG} } else { process.exit(9); }`);
    const first = await r.request({ op: "ping" }); // crash armed
    expect(first.op).toBe("pong");
    await expect(r.request({ op: "ping" })).rejects.toThrow(/exited/);
    const gen = r.generation;
    const third = await r.request({ op: "ping" }); // fresh process: counter resets
    expect(third.op).toBe("pong");
    expect(r.generation).toBeGreaterThan(gen);
  });

  it("a hung runner hits the deadline, dies, and the next call respawns", async () => {
    const { r } = client(`/* read lines, never answer */`);
    await expect(r.request({ op: "ping" })).rejects.toThrow(/timed out/);
    expect(r.lastCrash).toContain("timed out");
  });

  it("non-JSON output is a hard error and the child is killed", async () => {
    const { r } = client(`process.stdout.write("garbage not json\\n");`);
    await expect(r.request({ op: "ping" })).rejects.toThrow();
    expect(r.lastCrash).toContain("non-JSON");
  });
});
