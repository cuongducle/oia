import { describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { parseOutline, makeGeneratePoster } from "../src/processors.js";
import { LocalFileStore } from "../src/storage.js";
import type { ImageProvider, LlmProvider, ProviderCapabilities } from "@oia/providers";
import { MockLlmProvider } from "@oia/providers";

const anyCaps = (): ProviderCapabilities => ({
  referenceImages: true,
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: true,
});

describe("BR-PROC processors", () => {
  it("parseOutline: valid JSON keeps slide order", () => {
    const o = parseOutline(JSON.stringify({
      title: "Q3 Review",
      slides: [{ title: "A", bullets: ["1", "2"], imagePrompt: "chart" }, { title: "B", bullets: [], imagePrompt: "team" }],
    }));
    expect(o.title).toBe("Q3 Review");
    expect(o.slides.map((s) => s.title)).toEqual(["A", "B"]);
  });
  it("parseOutline: clamps to maxSlides (5..30 per schema)", () => {
    const many = { title: "t", slides: Array.from({ length: 30 }, (_, i) => ({ title: `s${i}`, bullets: [], imagePrompt: "x" })) };
    expect(parseOutline(JSON.stringify(many), 5).slides).toHaveLength(5);
  });
  it("parseOutline: missing slides[] falls back to one slide (demo/mock still works)", () => {
    const o = parseOutline('{"title":"x","imagePrompt":"p","copy":"C"}');
    expect(o.slides).toHaveLength(1);
    expect(o.slides[0]).toMatchObject({ imagePrompt: "p", bullets: ["C"] });
  });
});

describe("BR-PROC provider injection (no bare registry lookups)", () => {
  it("generate-poster uses the INJECTED image provider — the env-configured, metered one from ProcCtx", async () => {
    // Regression: processors used to call getImageProvider() bare, which read the
    // utility process's process.env (IMAGE_PROVIDER never set there) — every task
    // silently ran MockImageProvider and skipped the QuotaMeter, codex mode included.
    const seen: string[] = [];
    const probe: ImageProvider = {
      name: "probe",
      capabilities: anyCaps(),
      isAvailable: async () => ({ ok: true, detail: "probe" }),
      generate: async (input) => {
        seen.push(input.prompt);
        return { url: "data:image/png;base64,iVBORw0KGgo=", provider: "probe", model: "probe", width: 1360, height: 2048 };
      },
    };
    const llm: LlmProvider = new MockLlmProvider();
    const store = new LocalFileStore(mkdtempSync(path.join(tmpdir(), "oia-procctx-")));
    const run = makeGeneratePoster({ store, image: probe, llm });
    const out = await run({ prompt: "poster probe" }, { jobId: "job-probe", signal: new AbortController().signal });
    expect(seen).toEqual(["poster probe"]); // OLD code: [] — the registry mock ran instead
    expect(out.urls[0]).toContain("/api/files/");
  });
});
