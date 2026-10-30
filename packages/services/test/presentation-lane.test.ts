import { describe, it, expect, beforeEach } from "vitest";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { createServiceContext, type ServiceContext } from "../src/index.js";

/**
 * F4 gate — the presentation lane end to end over the REAL pptxgenjs (and its
 * image-size dependency, forced across a major by the root override): mock
 * providers produce the slide image, the processor must emit a readable .pptx.
 * This is also the lane's first integration test at all.
 */

async function freshCtx(): Promise<ServiceContext> {
  const dataDir = mkdtempSync(path.join(tmpdir(), "oia-pptx-"));
  return createServiceContext({ dataDir, env: { IMAGE_PROVIDER: "mock", LLM_PROVIDER: "mock" } });
}

beforeEach(() => {
  delete (globalThis as unknown as { __oiaMeteredInFlight?: unknown }).__oiaMeteredInFlight;
});

describe("generate-presentation (real pptxgenjs + image-size)", () => {
  it("produces a valid pptx file url through the file store", async () => {
    const ctx = await freshCtx();
    const status = await ctx.taskStore.submit(
      "generate-presentation",
      { prompt: "quarterly review", n: 5 },
      { noWait: true },
    );
    expect(status.progress).toBe("succeeded");
    const url = (status.taskResult as { download?: string } | null)?.download ?? "";
    expect(url).toMatch(/\.pptx$/);
    const key = url.replace(/^\/api\/files\//, "");
    const bytes = await ctx.files.read(key);
    // a real pptx is a ZIP: "PK" magic + [Content_Types].xml with the presentation part
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
    const asText = Buffer.from(bytes.slice(0, 200_000)).toString("latin1");
    expect(asText).toContain("[Content_Types].xml");
  }, 30_000);
});
