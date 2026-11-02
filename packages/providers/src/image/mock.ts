import { deflateSync } from "node:zlib";
import type { ImageProvider, ImageGenInput, ImageGenResult, ProviderDiagnostic, ProviderCapabilities } from "../types.js";

/**
 * Default provider — needs no key and NEVER calls the network (tests stay stable offline).
 * Returns an embedded 8×8 placeholder PNG (data URL) — the canvas scales it; enough for the pipeline, demos, and CI.
 * TP.6: declares `isMock: true` (the 8×8 placeholder is what a keyless first-run user
 * actually sees) so Home can label "Trial mode — placeholder images, not real AI".
 *
 * The placeholder is DETERMINISTIC PER PROMPT (fnv1a hash → color): "different
 * request → different image" is what a mock owes the gates that watch asset
 * identity (A1 preview-apply pins "exactly one src changed" on it — one fixed
 * PNG for everything deduped to the same URL and made swap vs no-op identical).
 */

/** 32-bit FNV-1a — tiny, stable, no dependencies. */
function fnv1a(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** A valid 8×8 RGBA PNG whose color derives from the prompt hash (checkerboard
 *  shade so scaled-up fills are visibly non-flat). Deterministic: same prompt in,
 *  same bytes out. */
export function placeholderPng(prompt: string): string {
  const h = fnv1a(prompt);
  const r = (h >>> 16) & 0xff;
  const g = (h >>> 8) & 0xff;
  const b = h & 0xff;
  const W = 8;
  const H = 8;
  const raw = Buffer.alloc(H * (1 + W * 4));
  for (let y = 0; y < H; y++) {
    const row = y * (1 + W * 4);
    raw[row] = 0; // filter: none
    for (let x = 0; x < W; x++) {
      const lift = (x + y) % 2 ? 28 : 0;
      const o = row + 1 + x * 4;
      raw[o] = Math.min(255, r + lift);
      raw[o + 1] = Math.min(255, g + lift);
      raw[o + 2] = Math.min(255, b + lift);
      raw[o + 3] = 255;
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // color type: RGBA
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk("IHDR", ihdr),
    pngChunk("IDAT", deflateSync(raw)),
    pngChunk("IEND", Buffer.alloc(0)),
  ]);
  return `data:image/png;base64,${png.toString("base64")}`;
}

const MOCK_CAPABILITIES: ProviderCapabilities = {
  // The mock accepts (and ignores) reference inputs — it returns a deterministic
  // placeholder for ANY generate() call, so declaring "cannot" was a lie about
  // itself; B1's deconstruct lane runs on mock pairs in every gate.
  referenceImages: true,
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: true,
};

export class MockImageProvider implements ImageProvider {
  readonly name = "mock";
  readonly capabilities: ProviderCapabilities = MOCK_CAPABILITIES;
  async generate(input: ImageGenInput): Promise<ImageGenResult> {
    return { url: placeholderPng(input.prompt ?? ""), provider: "mock", model: "placeholder-offline", width: 8, height: 8 };
  }
  async isAvailable(): Promise<ProviderDiagnostic> {
    return { ok: true, detail: "mock image provider — offline, no network" };
  }
}
