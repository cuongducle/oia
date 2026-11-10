import { describe, it, expect, afterEach } from "vitest";
import { writeFileSync, mkdtempSync, rmSync, chmodSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { SegmentRunner, resolveSegmentRuntime, f32ToB64, b64ToF32 } from "../src/utility/segmentation/runner.js";

/**
 * The sidecar client's REAL error paths, through a real child process (a fake
 * runner script), not mocks: segmentation-process-plan.md exists because a
 * native crash killed the whole utility process; this suite pins that a runner
 * crash is now only a rejected promise and the next call respawns it.
 *
 * Fake runner contract notes mirror segment-runner/src/main.rs.
 */
const cases = tmpdir();
let dir: string | null = null;
const runners: SegmentRunner[] = [];

function fakeRunner(body: string): { runnerDir: string } {
  dir ??= mkdtempSync(path.join(cases, "oia-seg-client-"));
  const d = path.join(dir, `fake-${Math.random().toString(36).slice(2)}`);
  mkdirSync(d, { recursive: true });
  const exe = path.join(d, "oia-segment-runner");
  writeFileSync(exe, `#!/bin/sh\n${body}\n`, { mode: 0o755 });
  chmodSync(exe, 0o755);
  // resolveSegmentRuntime also wants the ORT lib file present
  writeFileSync(path.join(d, "libonnxruntime.1.dylib"), "fake");
  return { runnerDir: d };
}

function client(runnerDir: string): SegmentRunner {
  const rt = resolveSegmentRuntime(runnerDir)!;
  expect(rt).not.toBeNull();
  const r = new SegmentRunner(rt, 4_000);
  runners.push(r);
  return r;
}

afterEach(() => {
  for (const r of runners.splice(0)) r.kill();
});

describe("resolveSegmentRuntime", () => {
  it("null when the runner binary or the ORT lib is missing (the capability gate)", () => {
    const d = mkdtempSync(path.join(cases, "oia-seg-empty-"));
    expect(resolveSegmentRuntime(d)).toBeNull();
    writeFileSync(path.join(d, "oia-segment-runner"), "x", { mode: 0o755 });
    expect(resolveSegmentRuntime(d)).toBeNull(); // still no ORT lib
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
  it("happy path: ping -> pong, requests are sequential", async () => {
    const { runnerDir } = fakeRunner(`while read line; do
  echo '{"op":"pong"}'
done`);
    const r = client(runnerDir);
    const pong = await r.request({ op: "ping" });
    expect(pong).toEqual({ op: "pong" });
    const second = await r.request({ op: "ping" });
    expect(second.op).toBe("pong");
    expect(r.generation).toBe(1); // one spawn, reused
  });

  it("an error response rejects with the runner's message", async () => {
    const { runnerDir } = fakeRunner(`while read line; do
  echo '{"op":"error","message":"vision run: boom"}'
done`);
    const r = client(runnerDir);
    await expect(r.request({ op: "ping" })).rejects.toThrow(/vision run: boom/);
  });

  it("a MID-RUN CRASH is a rejected promise + a fresh spawn on the next call (the utility must survive)", async () => {
    const { runnerDir } = fakeRunner(`first=1
while read line; do
  if [ "$first" = "1" ]; then
    echo '{"op":"pong"}'
    first=0
  else
    kill -9 $$
  fi
done`);
    const r = client(runnerDir);
    const first = await r.request({ op: "ping" }); // crash armed
    expect(first.op).toBe("pong");
    await expect(r.request({ op: "ping" })).rejects.toThrow(/exited/);
    // the NEXT call must respawn transparently (generation bumped, cache keys die with it)
    const gen = r.generation;
    const third = await r.request({ op: "ping" });
    expect(third.op).toBe("pong");
    expect(r.generation).toBeGreaterThan(gen);
  });

  it("a hung runner hits the deadline, dies, and the next call respawns", async () => {
    const { runnerDir } = fakeRunner(`sleep 30`);
    const r = client(runnerDir);
    await expect(r.request({ op: "ping" })).rejects.toThrow(/timed out/);
    expect(r.lastCrash).toContain("timed out");
  });

  it("non-JSON output is a hard error and the child is killed", async () => {
    const { runnerDir } = fakeRunner(`echo 'garbage not json'
sleep 5`);
    const r = client(runnerDir);
    await expect(r.request({ op: "ping" })).rejects.toThrow();
    expect(r.lastCrash).toContain("non-JSON");
  });
});
