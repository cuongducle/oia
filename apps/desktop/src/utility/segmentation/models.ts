/** Model manager for the local SAM 3 int8 engine (D21).
 *  Downloads ONNX weights + the CLIP tokenizer files on first use into
 *  <userData>/models/sam3 (never bundled: 880 MB + Meta SAM License).
 *  Atomic writes (tmp + rename, EPERM retry) and sha256 pinning: a partial or
 *  tampered download can never be mistaken for an installed model. */
import { createHash } from "node:crypto";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";

export const SEGMENT_MODELS = [
  { name: "vision_encoder_int8.onnx", url: "https://huggingface.co/danilobukvic/sam3-text-onnx/resolve/main/vision_encoder_int8.onnx", bytes: 496047770, sha256: "1a688329a8be3ae32d5f0bbf20657faac5a38e257fa30e8f5469a7e513a0b51c" },
  { name: "text_encoder_int8.onnx", url: "https://huggingface.co/danilobukvic/sam3-text-onnx/resolve/main/text_encoder_int8.onnx", bytes: 357021801, sha256: "c0baf8a4165ecc4039bee9389903723e74a68d617d685a4f1dbfc21c58bb4121" },
  { name: "decoder_int8.onnx", url: "https://huggingface.co/danilobukvic/sam3-text-onnx/resolve/main/decoder_int8.onnx", bytes: 26804694, sha256: "d721e7b643bb3ee2c48a59d520401c035c702cfbb13cb7f50fa103f0beb27af8" },
  { name: "tokenizer-vocab.json", url: "https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/vocab.json", bytes: 862328, sha256: "5047b556ce86ccaf6aa22b3ffccfc52d391ea4accdab9c2f2407da5b742d4363" },
  { name: "tokenizer-merges.txt", url: "https://huggingface.co/openai/clip-vit-base-patch32/resolve/main/merges.txt", bytes: 524657, sha256: "f526393189112391ce6f9795d4695f704121ce452c3aad1f5335cc41337eba85" },
] as const;

export type SegmentModelsStatus =
  | { state: "ready"; dir: string }
  | { state: "downloading"; file: string; downloadedBytes: number; totalBytes: number }
  | { state: "missing"; missingBytes: number; totalBytes: number };

/** bytes still missing (0 = everything present with pinned size). */
export async function missingBytesFor(dir: string, models: readonly { name: string; bytes: number }[]): Promise<{ missing: number; total: number; ready: boolean }> {
  let missing = 0;
  const total = models.reduce((s, m) => s + m.bytes, 0);
  for (const m of models) {
    const st = await stat(path.join(dir, m.name)).catch(() => null);
    if (!st || st.size !== m.bytes) missing += m.bytes - (st?.size ?? 0);
  }
  return { missing: Math.max(0, missing), total, ready: missing === 0 };
}

export class SegmentModelManager {
  private progress: { file: string; downloadedBytes: number; totalBytes: number } | null = null;
  private run: Promise<void> | null = null;
  constructor(private dir: string, private readonly fetchImpl: typeof fetch = fetch, private readonly models: readonly { name: string; url: string; bytes: number; sha256: string }[] = SEGMENT_MODELS) {}
  setDir(dir: string): void { this.dir = dir; }

  status(): SegmentModelsStatus {
    if (this.progress) return { state: "downloading", ...this.progress };
    return { state: "missing", missingBytes: 0, totalBytes: 0 } as SegmentModelsStatus; // replaced by ensureStatus
  }

  async ensureStatus(): Promise<SegmentModelsStatus> {
    if (this.progress) return { state: "downloading", ...this.progress };
    const { missing, total, ready } = await missingBytesFor(this.dir, this.models);
    return ready ? { state: "ready" as const, dir: this.dir } : { state: "missing" as const, missingBytes: missing, totalBytes: total };
  }

  /** Starts (or joins) the download. Safe to call repeatedly; failures reset so
   *  a retry re-downloads. The tmp file is removed on any failure. */
  download(onProgress?: (p: { file: string; downloadedBytes: number; totalBytes: number }) => void): Promise<void> {
    this.run ??= this.doDownload(onProgress).catch((err) => { this.run = null; throw err; });
    return this.run;
  }

  private async doDownload(onProgress?: (p: { file: string; downloadedBytes: number; totalBytes: number }) => void): Promise<void> {
    await mkdir(this.dir, { recursive: true });
    for (const m of this.models) {
      const dest = path.join(this.dir, m.name);
      const st = await stat(dest).catch(() => null);
      if (st?.size === m.bytes) continue;
      const tmp = `${dest}.tmp`;
      await rm(tmp, { force: true });
      this.progress = { file: m.name, downloadedBytes: 0, totalBytes: m.bytes };
      const res = await this.fetchImpl(m.url);
      if (!res.ok || !res.body) throw new Error(`download ${m.name} HTTP ${res.status}`);
      const hash = createHash("sha256");
      let got = 0;
      const reader = res.body.getReader();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        hash.update(value);
        got += value.byteLength;
        this.progress = { file: m.name, downloadedBytes: got, totalBytes: m.bytes };
        onProgress?.({ ...this.progress });
        await appendChunk(tmp, value);
      }
      if (got !== m.bytes) { await rm(tmp, { force: true }); throw new Error(`download ${m.name} incomplete (${got}/${m.bytes})`); }
      if (hash.digest("hex") !== m.sha256) { await rm(tmp, { force: true }); throw new Error(`checksum mismatch for ${m.name}, download again`); }
      await renameWithRetry(tmp, dest);
    }
    this.progress = null;
    this.run = null;
  }
}

async function appendChunk(file: string, chunk: Uint8Array): Promise<void> {
  const { appendFile, writeFile } = await import("node:fs/promises");
  // first chunk writes fresh (appendFile creates), fine for the tmp lifecycle here
  await appendFile(file, chunk).catch(async (e: NodeJS.ErrnoException) => {
    if (e.code === "ENOENT") await writeFile(file, chunk);
    else throw e;
  });
}

async function renameWithRetry(from: string, to: string): Promise<void> {
  for (let i = 0; ; i++) {
    try { await rename(from, to); return; }
    catch (e) {
      const code = (e as NodeJS.ErrnoException).code;
      if ((code === "EPERM" || code === "EBUSY") && i < 10) await new Promise((r) => setTimeout(r, 50 * (i + 1)));
      else throw e;
    }
  }
}
