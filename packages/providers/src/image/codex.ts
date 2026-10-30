import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { cleanPlateZoneClause } from "@oia/schema";
import type { ImageProvider, ImageGenInput, ImageGenResult, ProviderDiagnostic, ProviderCapabilities } from "../types.js";
import { ProviderError } from "../types.js";
import {
  CodexBridge, classifyCodexFailure, findSessionImage, newestGeneratedImage, parseImagePath,
  noteCancelledImageJob, waitForStableFile,
} from "../codex/bridge.js";
import { asciiUuid, createScratchDir, removeScratchDir } from "../cli/runtime.js";

/**
 * Codex `$imagegen` channel — the keyless artwork path over the user's ChatGPT login.
 * Refactored onto the shared bridge (TP.2/TP.8): stdin prompts, pinned model,
 * `--ignore-user-config`, workspace-write sandbox scoped to the job scratch.
 *
 * Mode-aware prompts (TP.3): poster keeps the text fidelity guard (baked text is
 * deliberate design); clean-plate forbids ADDED typography and reserves calm copy
 * zones — the zone clause is DERIVED from the shared geometry in @oia/schema
 * (single source of truth — prompt and canvas placement cannot drift apart).
 * Reference images (TP.9): materialized to ASCII-named temp files and attached via `-i`.
 * Output location (spike S1): session directory via --json thread id; the stdout
 * `File:` marker is a hint; the shared-tree scan is a provenance-marked last resort
 * (A8: never an image written around a cancelled job — see the bridge cancel ledger).
 */

/** Default image-call budget — the registry threads CODEX_IMAGE_TIMEOUT_MS per provider instance (T3: no import-time env reads). */
export const CODEX_IMAGE_TIMEOUT_DEFAULT = 300_000;

const IMAGE_CAPABILITIES: ProviderCapabilities = {
  referenceImages: true,
  // exact pixels cannot be requested on this channel — the prompt carries orientation only
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: true },
  transparentBg: false,
  isMock: false,
};

/** TP.3 — poster mode: text renders in the artwork, fidelity-guarded (today's behavior). */
export function buildPosterPrompt(input: ImageGenInput): string {
  const orientation = orientationFor(input.width, input.height);
  return (
    `$imagegen Create a ${orientation} image. ` +
    `Subject: ${input.prompt}. ` +
    `Render all text exactly as written, keep it sharp and readable.`
  );
}

/** TP.3 — clean-plate mode: text-free artwork with reserved copy zones (no duplicated copy).
 *  The clause comes from the shared zone geometry (@oia/schema) — never hand-copied here. */
export function buildCleanPlatePrompt(input: ImageGenInput): string {
  const orientation = orientationFor(input.width, input.height);
  return (
    `$imagegen Create a ${orientation} image. ` +
    `Subject: ${input.prompt}. ` +
    `Do NOT add any text, lettering, numbers, words, captions, logos, or watermarks to the artwork — the copy will be added later as separate editable layers. ` +
    cleanPlateZoneClause() +
    (input.referenceImages?.length
      ? ` Any text that is part of the product's own packaging or printed label must be preserved exactly and remain legible — never alter brand lettering.`
      : "")
  );
}

/** TP.9 — documented reference-image patterns: identify by order, state what stays the same. */
export function referenceClauses(referenceImages: string[]): string {
  const described = referenceImages
    .map((_, i) => `Image ${i + 1}`)
    .join(" is a reference; ");
  return (
    ` References: ${described} is a reference. Use the reference image(s) as the visual subject of the scene: ` +
    `keep the product, camera angle, lighting, and proportions consistent with the reference; preserve the product's own packaging and printed labels exactly; ` +
    `build the composition around the actual product.` + (referenceImages.length > 1 ? ` Image 1 is the primary subject.` : "")
  );
}

function orientationFor(width: number, height: number): "landscape" | "vertical" | "square" {
  const ratio = width / height;
  return ratio > 1.1 ? "landscape" : ratio < 0.9 ? "vertical" : "square";
}

/** PNG IHDR reader + IEND check — the actual output size recorded on the job result (TP.8),
 *  and a complete-PNG guard (a truncated flush fails the IEND check — B8). */
export function pngSize(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return undefined;
  const iend = Buffer.from("IEND");
  const tail = buf.subarray(buf.length - 12, buf.length - 4); // IEND chunk: len(4) + type(4) + crc(4)
  if (!tail.subarray(4, 8).equals(iend)) return undefined; // truncated
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}

/** Materialize a reference (data URL / http URL / absolute file path) into an ASCII-named temp file. */
async function materializeReference(ref: string, dir: string): Promise<string> {
  if (ref.startsWith("data:")) {
    const b64 = ref.slice(ref.indexOf(",") + 1);
    const file = path.join(dir, `${asciiUuid()}.png`);
    await writeFile(file, Buffer.from(b64, "base64"));
    return file;
  }
  if (/^https?:\/\//i.test(ref)) {
    const res = await fetch(ref).catch(() => null);
    if (!res?.ok) throw new ProviderError("network", `could not fetch reference image (HTTP ${res?.status ?? "network"})`, { provider: "codex" });
    const file = path.join(dir, `${asciiUuid()}.png`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    return file;
  }
  // local file path: probe readability, resolve to ABSOLUTE — a relative path must never
  // fall through to an unwritten temp file (B1: that attached a 0-byte png to `-i`)
  const abs = path.resolve(ref);
  await readFile(abs); // throws a clear fs error when unreadable
  return abs;
}

/** A6 — format_drift watch: consecutive fallback-scan locates mean the documented output
 *  shape moved; surface a warning (log + result.warnings) instead of silence. */
const gDrift = globalThis as unknown as { __oiaCodexFallbackStreak?: number };
function noteLocatorProvenance(provenance: ImageGenResult["provenance"], jobId: string | undefined): string[] {
  if (provenance === "fallback-scan") {
    gDrift.__oiaCodexFallbackStreak = (gDrift.__oiaCodexFallbackStreak ?? 0) + 1;
    if (gDrift.__oiaCodexFallbackStreak >= 2) {
      console.warn(`[codex] format_drift: output locator fell back to the mtime scan ${gDrift.__oiaCodexFallbackStreak}× in a row (jobId=${jobId ?? "n/a"}) — stdout shape may have changed`);
      return ["format_drift"];
    }
    return [];
  }
  gDrift.__oiaCodexFallbackStreak = 0;
  return [];
}

export class CodexImageProvider implements ImageProvider {
  readonly name = "codex";
  readonly capabilities: ProviderCapabilities = IMAGE_CAPABILITIES;
  private readonly bridge: CodexBridge;
  private readonly timeoutMs: number;
  /** Test seam: override the generated_images root. */
  readonly imagesRoot?: string;

  constructor(bridge?: CodexBridge, opts: { timeoutMs?: number; imagesRoot?: string } = {}) {
    this.bridge = bridge ?? new CodexBridge();
    this.timeoutMs = opts.timeoutMs ?? CODEX_IMAGE_TIMEOUT_DEFAULT;
    this.imagesRoot = opts.imagesRoot;
  }

  async isAvailable(): Promise<ProviderDiagnostic> {
    return this.bridge.diagnose();
  }

  async generate(input: ImageGenInput): Promise<ImageGenResult> {
    const refDir = await createScratchDir("codex-refs");
    let refFiles: string[] = [];
    try {
      refFiles = await Promise.all((input.referenceImages ?? []).map((r) => materializeReference(r, refDir)));
      const base = input.mode === "clean-plate" ? buildCleanPlatePrompt(input) : buildPosterPrompt(input);
      const prompt = refFiles.length ? base + referenceClauses(input.referenceImages!) : base;

      const res = await this.bridge.exec({
        role: "image",
        prompt,
        images: refFiles,
        timeoutMs: this.timeoutMs,
        signal: input.signal,
        jobId: input.jobId ?? `image-${randomUUID()}`,
      });
      if (res.code !== 0 || res.timedOut || res.aborted) {
        // A8: a killed job's late-flushed PNG must not leak into a later fallback scan
        noteCancelledImageJob();
        throw classifyCodexFailure(res);
      }

      // Locator ladder (spike S1): session directory > stdout hint > provenance-marked fallback scan
      let file: string | null = null;
      let provenance: ImageGenResult["provenance"] = "parsed";
      if (res.threadId) file = await findSessionImage(res.threadId, this.imagesRoot);
      if (!file) {
        const hint = parseImagePath(res.stdout);
        if (hint) {
          file = hint;
          provenance = "hint";
        }
      }
      if (!file) {
        file = await newestGeneratedImage(10 * 60_000, this.imagesRoot);
        provenance = "fallback-scan";
      }
      if (!file) {
        await this.bridge.cleanup(res);
        throw new ProviderError("no_output", "codex produced no image file — run `codex exec` manually to inspect it", {
          provider: "codex",
          detail: res.stdout.slice(-300),
        });
      }

      // B8: exit 0 does not guarantee the PNG flush finished — wait for a stable size
      await waitForStableFile(file);
      const buf = await readFile(file);
      await this.bridge.cleanup(res);
      if (!buf.length) throw new ProviderError("no_output", "codex image file is empty", { provider: "codex" });
      const size = pngSize(buf);
      if (!size) {
        throw new ProviderError("format_drift", "codex image file is not a complete PNG (truncated after exit)", {
          provider: "codex",
          detail: `${file} (${buf.length} bytes)`,
        });
      }
      const warnings = noteLocatorProvenance(provenance, input.jobId);
      return {
        url: `data:image/png;base64,${buf.toString("base64")}`,
        provider: "codex",
        model: "chatgpt-imagegen (gpt-image family, plan usage)",
        width: size.width,
        height: size.height,
        provenance,
        warnings,
      };
    } finally {
      await removeScratchDir(refDir);
    }
  }
}
