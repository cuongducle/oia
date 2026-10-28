import { spawn } from "node:child_process";
import { readFile, readdir, stat } from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import type { ImageProvider, ImageGenInput, ImageGenResult } from "../types.js";



/**
 * Provider Codex $imagegen — BR-CODEX
 *
 * Behavior (verified experimentally 2026-10-27, free ChatGPT account):
 * - Log in once with `codex login` (Sign in with ChatGPT) — no API key needed.
 * - Runs `codex exec --skip-git-repo-check ’$imagegen <prompt>’`.
 * - stdout contains "File: [name](/abs/path.png)" — images land under ~/.codex/generated_images/.
 * - Consumes Codex quota (~15k tokens/image) — 3:4 defaults to roughly 1086×1448.
 * - Images return as data URLs so Fabric canvases (browser) can use them directly.
 *
 * Known risks: (1) depends on the Codex CLI being installed; (2) the stdout format may change —
 * a generated_images directory scan (by mtime) is the fallback.
 */
export class CodexImageProvider implements ImageProvider {
  readonly name = "codex";
  constructor(private codexBin = process.env.CODEX_BIN ?? "codex") {}

/** Availability check: the codex binary exists and is logged in. */
  async isAvailable(): Promise<boolean> {
    try {
      const { stdout, stderr } = await this.run(["login", "status"], 15_000);
      // "Logged in using ChatGPT" in ra stderr (codex in status qua stderr)
      return /Logged in/i.test(`${stdout}\n${stderr}`);
    } catch {
      return false;
    }
  }

/** Run codex with stdin="ignore" — codex waits for stdin EOF when the pipe stays open. */
  private run(args: string[], timeoutMs: number): Promise<{ stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(this.codexBin, args, { stdio: ["ignore", "pipe", "pipe"] });
      let stdout = "", stderr = "";
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error(`codex timeout sau ${timeoutMs / 1000}s: ${args.join(" ").slice(0, 80)}`));
      }, timeoutMs);
      child.stdout.on("data", (d) => (stdout += d));
      child.stderr.on("data", (d) => (stderr += d));
      child.on("error", (e) => { clearTimeout(timer); reject(e); });
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve({ stdout, stderr });
        else reject(new Error(`codex exit ${code}: ${stderr.slice(0, 200)}`));
      });
    });
  }

  async generate(input: ImageGenInput): Promise<ImageGenResult> {
    const ratio = input.width / input.height;
    const orientation = ratio > 1.1 ? "landscape" : ratio < 0.9 ? "vertical" : "square";
    const prompt =
      `$imagegen Create a ${orientation} image. ` +
      `Subject: ${input.prompt}. ` +
      `Render all text exactly as written, keep it sharp and readable.`;

    const { stdout } = await this.run(["exec", "--skip-git-repo-check", prompt], 6 * 60_000);

    const file = extractImagePath(stdout) ?? (await newestGeneratedImage());
      if (!file) throw new Error("codex imagegen: no image file found in the output — run `codex exec` manually to inspect it");

    const buf = await readFile(file);
    return {
      url: `data:image/png;base64,${buf.toString("base64")}`,
      provider: "codex",
      model: "chatgpt-imagegen (gpt-image family, plan usage)",
    };
  }
}

/** Parse "File: [name](/abs/path.png)" from codex stdout. */
export function extractImagePath(stdout: string): string | null {
  const m = stdout.match(/File:\s*\[[^\]]*\]\((\/[^\s)]+\.(?:png|jpg|jpeg|webp))\)/);
  return m ? m[1] : null;
}

/** Fallback: the newest image in ~/.codex/generated_images (recent window). */
export async function newestGeneratedImage(withinMs = 10 * 60_000): Promise<string | null> {
  const root = path.join(os.homedir(), ".codex", "generated_images");
  let dirs: string[];
  try {
    dirs = (await readdir(root, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => path.join(root, d.name));
  } catch {
    return null;
  }
  let best: { file: string; mtime: number } | null = null;
  for (const dir of dirs) {
    let files: string[];
    try {
      files = await readdir(dir);
    } catch {
      continue;
    }
    for (const f of files.filter((f) => /\.(png|jpe?g|webp)$/i.test(f))) {
      const file = path.join(dir, f);
      const s = await stat(file);
      if (Date.now() - s.mtimeMs <= withinMs && (!best || s.mtimeMs > best.mtime)) best = { file, mtime: s.mtimeMs };
    }
  }
  return best?.file ?? null;
}
