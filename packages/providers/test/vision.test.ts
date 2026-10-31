import { describe, expect, it, beforeAll } from "vitest";
import { mkdirSync, writeFileSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CodexLlmProvider } from "../src/llm/codex.js";
import { MockLlmProvider } from "../src/llm/mock.js";
import { CodexBridge } from "../src/codex/bridge.js";
import { DECONSTRUCT_READ_MARKER, DECONSTRUCT_JSON_SCHEMA } from "@oia/schema";

/** B1 — the vision-read provider surface (deconstruct-import.md DC-3/DC-4). */
describe("readImage (B1 deconstruct)", () => {
  const fakeDir = path.join(tmpdir(), `oia-vision-${Date.now()}`);
  beforeAll(() => mkdirSync(fakeDir, { recursive: true }));

  it("codex readImage: planner role + -i attach + caller schema + read-only sandbox", async () => {
    const bin = path.join(fakeDir, "readwriter");
    // mimics codex: writes the read JSON to the -o file, echoes ARGS for pinning
    writeFileSync(
      bin,
      `#!/bin/sh
OUT=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then OUT="$2"; fi
  shift
done
echo "ARGS:$@"
echo '{"type":"thread.started","thread_id":"t777"}'
printf '{"texts":[{"text":"SALE 50","box":{"x":0.1,"y":0.1,"w":0.5,"h":0.08}}]}' > "$OUT"
`,
    );
    chmodSync(bin, 0o755);
    const provider = new CodexLlmProvider(new CodexBridge({ bin }), { timeoutMs: 5_000 });
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const raw = await provider.readImage("read the text", pngHeader, DECONSTRUCT_JSON_SCHEMA);
    expect(JSON.parse(raw).texts[0].text).toBe("SALE 50");
  });

  it("bridge planner role attaches images via -i (B1) while keeping the read-only sandbox", async () => {
    const bin = path.join(fakeDir, "argsecho");
    writeFileSync(
      bin,
      `#!/bin/sh
echo "ARGS:$@"
`,
    );
    chmodSync(bin, 0o755);
    const res = await new CodexBridge({ bin }).exec({
      role: "planner",
      prompt: "read the text",
      images: ["/tmp/oia-vision-abc.png"],
      timeoutMs: 5_000,
      jobId: "vision-pin",
    });
    const argsLine = res.stdout.split("\n").find((l) => l.startsWith("ARGS:"))!;
    expect(argsLine).toContain("-i /tmp/oia-vision-abc.png");
    expect(argsLine).toContain("--sandbox read-only");
  });

  it("mock readImage is deterministic and marker-keyed (PLANNER_INSTRUCTIONS pattern)", async () => {
    const mock = new MockLlmProvider();
    const out = JSON.parse(await mock.readImage(`shared prompt ending with ${DECONSTRUCT_READ_MARKER}`, new Uint8Array(4)));
    expect(out.texts[0].text).toBe("SALE 50");
    expect(out.texts.every((t: { box: { w: number; h: number } }) => t.box.w <= 1 && t.box.h <= 1)).toBe(true);
    await expect(mock.readImage("unrelated prompt", new Uint8Array(4))).rejects.toThrow(/deconstruct read/);
  });

  it("providers declare the capability gate the processor checks (TP.11)", () => {
    expect(new MockLlmProvider().capabilities.referenceImages).toBe(true);
    expect(new CodexLlmProvider().capabilities.referenceImages).toBe(true);
  });

  it("sniffImageExt tells the truth about bytes — no webp named .png (teardown B1)", async () => {
    const { sniffImageExt } = await import("../src/llm/codex.js");
    expect(sniffImageExt(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]))).toBe("png");
    expect(sniffImageExt(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe("jpg");
    expect(sniffImageExt(new Uint8Array([0x52, 0x49, 0x46, 0x60, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]))).toBe("webp");
    expect(sniffImageExt(new Uint8Array([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]))).toBe("gif");
    expect(sniffImageExt(new Uint8Array([0x42, 0x4d, 0x00]))).toBe("bmp");
    expect(sniffImageExt(new Uint8Array([1, 2, 3]))).toBe("png"); // unknown magic defaults to png
  });

  it("readImage materializes webp bytes under a .webp name", async () => {
    const bin = path.join(fakeDir, "extecho");
    // writes the -i path into the -o file so the provider RETURNS it for asserting
    writeFileSync(
      bin,
      `#!/bin/sh
OUT=""; IMG=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then OUT="$2"; fi
  if [ "$1" = "-i" ]; then IMG="$2"; fi
  shift
done
printf '{"img":"%s"}' "$IMG" > "$OUT"
`,
    );
    chmodSync(bin, 0o755);
    const provider = new CodexLlmProvider(new CodexBridge({ bin }), { timeoutMs: 5_000 });
    const webp = new Uint8Array([0x52, 0x49, 0x46, 0x60, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 1, 2, 3]);
    const raw = await provider.readImage("read it", webp, DECONSTRUCT_JSON_SCHEMA);
    const imgPath = JSON.parse(raw).img as string;
    expect(imgPath).toMatch(/\.webp$/); // the extension tells the truth about the bytes
  });
});
