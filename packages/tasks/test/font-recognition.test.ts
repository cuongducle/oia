import { describe, expect, it, vi, afterEach } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { PNG } from "pngjs";
import { makeRecognizeFonts, type FontRecognizer } from "../src/font-recognition.js";
import { LocalFileStore } from "../src/storage.js";
import { TaskStore } from "../src/store.js";
import { makeMatchFonts } from "../src/font-reference.js";
import { MockLlmProvider, MockImageProvider } from "@oia/providers";
import { deconstructTextSchema, type DeconstructText } from "@oia/schema";

function png(): Uint8Array {
  const p = new PNG({ width: 4, height: 4 });
  return PNG.sync.write(p);
}
const texts: DeconstructText[] = [deconstructTextSchema.parse({
  text: "Cà phê", box: { x: 0.1, y: 0.1, w: 0.5, h: 0.1 },
  typography: { fontFamily: "serif", fontWeight: 400, fontStyle: "normal", fill: "#111111", angle: 0, spacingEm: 0, textAlign: "left" },
})];
const hit = (lineIndex = 0) => ({
  lineIndex, family: "Gelasio", score: 0.9, weight: 400, style: "normal" as const, variable: false,
  url: "https://static.mixfont.com/fonts/gelasio/Gelasio-Regular.ttf",
  licenseUrl: "https://raw.githubusercontent.com/google/fonts/main/ofl/gelasio/OFL.txt",
});
const TTF_MAGIC = new Uint8Array([0x00, 0x01, 0x00, 0x00, 1, 2, 3, 4]);
const tctx = { jobId: "j", signal: new AbortController().signal };

function fakeRecognizer(): FontRecognizer {
  return { recognize: async () => [hit()] };
}

async function setup() {
  const root = mkdtempSync(path.join(tmpdir(), "oia-fonts-"));
  const store = new LocalFileStore(root);
  const src = await store.put(png(), "png");
  return { store, fileUrl: src.url, root };
}

afterEach(() => vi.unstubAllGlobals());

describe("D23 recognize-fonts", () => {
  it("retains data-only Lens results through TaskStore completion and reload", async () => {
    const { store, fileUrl, root } = await setup();
    try {
      vi.stubGlobal("fetch", async (url: string) => new Response(url.includes("raw.githubusercontent.com") ? "OFL" : TTF_MAGIC));
      const logFile = path.join(root, "tasks.jsonl"), tasks = new TaskStore({ logFile });
      tasks.register("recognize-fonts", makeRecognizeFonts({ store, image: new MockImageProvider(), llm: new MockLlmProvider(), fontRecognizer: fakeRecognizer() }));
      const result = await tasks.submit("recognize-fonts", { fileUrl, texts }, { noWait: true });
      expect(result.progress).toBe("succeeded");
      expect(result.taskResult?.download).toBeUndefined();
      expect(result.taskResult?.fontSuggestions?.[0].family).toBe("Gelasio");
      const restored = new TaskStore({ logFile }); await restored.load();
      expect(restored.get(result.taskId).taskResult).toEqual(result.taskResult);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("keeps a paid match-fonts response through TaskStore, rejects invalid IDs once", async () => {
    const { store, fileUrl, root } = await setup();
    try {
      let calls = 0, candidate = "F01";
      const llm = new MockLlmProvider();
      llm.readImage = async () => { calls++; return JSON.stringify({ matches: [{ lineIndex: 0, candidateIds: [candidate] }] }); };
      const tasks = new TaskStore({ logFile: path.join(root, "tasks.jsonl") });
      tasks.register("match-fonts", makeMatchFonts({ store, image: new MockImageProvider(), llm }));
      const params = { boardUrl: fileUrl, rows: [{ lineIndex: 0, candidateIds: ["F01"] }] };
      const result = await tasks.submit("match-fonts", params, { noWait: true });
      expect(result.progress).toBe("succeeded");
      expect(result.taskResult?.fontMatches).toEqual([{ lineIndex: 0, candidateIds: ["F01"] }]);
      expect(result.taskResult?.download).toBeUndefined();
      candidate = "F99";
      const invalid = await tasks.submit("match-fonts", params, { noWait: true });
      expect(invalid).toMatchObject({ progress: "failed", errorClass: "plan_parse_failed", taskResult: null });
      expect(calls).toBe(2);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("downloads OFL license + font bytes once, both live in the asset store", async () => {
    const { store, fileUrl, root } = await setup();
    try {
      const fetchMock = vi.fn(async (url: unknown) => {
        const u = String(url);
        if (u.includes("raw.githubusercontent.com")) return new Response(new TextEncoder().encode("OFL license text"), { status: 200 });
        if (u.includes("static.mixfont.com")) return new Response(TTF_MAGIC, { status: 200 });
        throw new Error(`unexpected host ${u}`);
      });
      vi.stubGlobal("fetch", fetchMock);
      const result = await makeRecognizeFonts({ store, image: {} as never, llm: {} as never, fontRecognizer: fakeRecognizer() })({ fileUrl, texts }, tctx);
      expect(result.fontSuggestions).toHaveLength(1);
      expect(fetchMock).toHaveBeenCalledTimes(2);
      const suggestion = result.fontSuggestions![0];
      expect(suggestion.family).toBe("Gelasio");
      expect(suggestion.source.url).toMatch(/^\/api\/files\//);
      expect(suggestion.source.licenseUrl).toMatch(/^\/api\/files\//);
      const font = await store.read(suggestion.source.url.replace(/^\/api\/files\//, ""));
      expect([...font.slice(0, 4)]).toEqual([...TTF_MAGIC.slice(0, 4)]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("skips a candidate whose bytes are not a font, keeps honest note, never throws raw", async () => {
    const { store, fileUrl, root } = await setup();
    try {
      vi.stubGlobal("fetch", async () => new Response(new Uint8Array([1, 2, 3, 4, 5]), { status: 200 }));
      const result = await makeRecognizeFonts({ store, image: {} as never, llm: {} as never, fontRecognizer: fakeRecognizer() })({ fileUrl, texts }, tctx);
      expect(result.fontSuggestions).toEqual([]);
      expect(result.note).toContain("unavailable");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("rejects a download from an unapproved host even if the recognizer names one", async () => {
    const { store, fileUrl, root } = await setup();
    try {
      const evil: FontRecognizer = { recognize: async () => [{ ...hit(), url: "https://evil.example/font.ttf" }] };
      vi.stubGlobal("fetch", async () => { throw new Error("must not fetch"); });
      const result = await makeRecognizeFonts({ store, image: {} as never, llm: {} as never, fontRecognizer: evil })({ fileUrl, texts }, tctx);
      expect(result.fontSuggestions).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("missing Lens build is capability_unsupported, never a silent no-op", async () => {
    const { store, fileUrl, root } = await setup();
    try {
      await expect(makeRecognizeFonts({ store, image: {} as never, llm: {} as never })({ fileUrl, texts }, tctx))
        .rejects.toMatchObject({ errorClass: "capability_unsupported" });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it("cancellation between font downloads propagates as AbortError", async () => {
    const { store, fileUrl, root } = await setup();
    try {
      const stop = new AbortController();
      let calls = 0;
      vi.stubGlobal("fetch", async () => { if (++calls === 2) { stop.abort(); throw new DOMException("The operation was aborted.", "AbortError"); } return new Response(TTF_MAGIC, { status: 200 }); });
      await expect(makeRecognizeFonts({ store, image: {} as never, llm: {} as never, fontRecognizer: fakeRecognizer() })({ fileUrl, texts }, { jobId: "j", signal: stop.signal }))
        .rejects.toMatchObject({ name: "AbortError" });
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
