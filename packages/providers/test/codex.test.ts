import { describe, expect, it } from "vitest";
import { extractImagePath, CodexImageProvider } from "../src/index.js";

/** Real stdout from an experimental run on 2026-10-27 (free ChatGPT account). */
const REAL_STDOUT = `
hook: PostToolUse Completed
codex
Created the 3:4 poster using built-in imagegen.

File: [iced coffee poster](/Users/x/.codex/generated_images/01a17d67-6b20-7440-81a5-78206ba6fa7c/exec-04d1a627-a40b-4c5f-8353-32f4c589fd3a.png).

The current directory is read-only, so I couldn’t copy it there.

Prompt: pastel pink and mint coffee poster, iced milk coffee with straw, bold "GIAM GIA 20%," playful doodles, clean modern style.
`;

describe("BR-CODEX provider $imagegen (Codex CLI + Sign in with ChatGPT)", () => {
  it("parses the image path from real codex exec stdout", () => {
    expect(extractImagePath(REAL_STDOUT)).toBe(
      "/Users/x/.codex/generated_images/01a17d67-6b20-7440-81a5-78206ba6fa7c/exec-04d1a627-a40b-4c5f-8353-32f4c589fd3a.png",
    );
  });
  it("stdout without File: → null (falls back to the directory scan)", () => {
    expect(extractImagePath("some random output")).toBeNull();
  });
  it("isAvailable=false when codex is not installed (missing binary) — no throw", async () => {
    const p = new CodexImageProvider("/nonexistent/codex-bin");
    expect(await p.isAvailable()).toBe(false);
  });
  // INTEGRATION: runs only when codex is logged in on this machine (skipped in CI)
  it("INTEGRATION generates a real image when logged in to codex", { timeout: 360_000 }, async () => {
    const p = new CodexImageProvider();
    if (!(await p.isAvailable())) return; // soft skip — never fails CI
    const result = await p.generate({ prompt: "pastel poster, big bold text 'OIA OK'", width: 1024, height: 1365 });
    expect(result.provider).toBe("codex");
    expect(result.url).toMatch(/^data:image\/png;base64,/);
    expect(result.url.length).toBeGreaterThan(10_000);
  });
});
