import type { ProviderCapabilities } from "@oia/schema";
import { ProviderError } from "../types.js";

/**
 * TP.9/TP.11 — shared wire module for the OpenAI Images protocol (generations + edits).
 * Thin adapters delegate transport here; copying this per provider is forbidden (drift).
 *
 * Both calls pin one configured model (default `gpt-image-2.5-sunburst`, the verified
 * server default at design time) — omitting the model lets a server-side default change
 * silently invalidate declared capabilities and split the two paths onto different models.
 * `OPENAI_IMAGE_MODEL` remains the override.
 */

export const OPENAI_IMAGE_MODEL_DEFAULT = "gpt-image-2.5-sunburst"; // env override threaded by the registry (T3) — no import-time env reads

export const OPENAI_IMAGE_CAPABILITIES: ProviderCapabilities = {
  referenceImages: true,
  sizePolicy: { trueRatio: true, divisibleBy: 16, ratioBounds: [1 / 3, 3], fixedSizes: null, orientationOnly: false },
  transparentBg: true,
  isMock: false,
};

/**
 * True-ratio size: requested dimensions rounded UP to the nearest multiple of 16,
 * ratio clamped to [1:3, 3:1]. A 900×1200 (3:4) banner is sent as 912×1200 —
 * no more snapping a 3:4 request into 2:3 (1024×1536) distortion.
 */
export function trueRatioSize(width: number, height: number, maxDim = 4096): string {
  const roundUp16 = (n: number) => Math.min(maxDim, Math.ceil(Math.max(1, n) / 16) * 16);
  let w = roundUp16(width);
  let h = roundUp16(height);
  const [minR, maxR] = [1 / 3, 3];
  const r = w / h;
  if (r > maxR) w = roundUp16(h * maxR);
  else if (r < minR) h = roundUp16(w / minR);
  return `${w}x${h}`;
}

/** Map an HTTP failure onto the stable error classes (rate limits never become timeouts). */
export function mapOpenAiError(status: number, body: string): ProviderError {
  if (status === 401) return new ProviderError("not_logged_in", "OpenAI API key is invalid or missing", { provider: "openai", detail: body.slice(0, 300) });
  if (status === 402) return new ProviderError("quota_exceeded", "OpenAI billing/quota exhausted", { provider: "openai", detail: body.slice(0, 300) });
  if (status === 429) return new ProviderError("rate_limited", "OpenAI rate limit hit", { provider: "openai", detail: body.slice(0, 300) });
  if (status === 404) return new ProviderError("provider_missing", "OpenAI model or endpoint not found", { provider: "openai", detail: body.slice(0, 300) });
  if (status >= 500) return new ProviderError("network", `OpenAI server error ${status}`, { provider: "openai", detail: body.slice(0, 300) });
  if (/content policy|safety|moderation/i.test(body)) {
    return new ProviderError("content_refused", "OpenAI refused the prompt", { provider: "openai", detail: body.slice(0, 300) });
  }
  return new ProviderError("unknown", `OpenAI HTTP ${status}`, { provider: "openai", detail: body.slice(0, 300) });
}

export interface OpenAiImagesCall {
  apiKey: string;
  model: string;
  prompt: string;
  width: number;
  height: number;
  /** Reference images (data URLs / http URLs) — presence switches generations → edits. */
  references?: string[];
  signal?: AbortSignal;
  baseUrl?: string;
}

/** Generations (no references) or edits (multipart `images[]`, up to 16, `input_fidelity: high`). */
export async function openAiImages(call: OpenAiImagesCall): Promise<{ url: string; model: string; width?: number; height?: number }> {
  const base = call.baseUrl ?? "https://api.openai.com/v1";
  const size = trueRatioSize(call.width, call.height);
  const refs = call.references ?? [];

  let res: Response;
  if (refs.length > 0) {
    const form = new FormData();
    form.append("model", call.model);
    form.append("prompt", call.prompt);
    form.append("size", size);
    form.append("input_fidelity", "high");
    for (const ref of refs.slice(0, 16)) {
      const blob = await refToBlob(ref);
      form.append("images[]", blob, `${crypto.randomUUID()}.png`);
    }
    res = await fetch(`${base}/images/edits`, {
      method: "POST",
      headers: { authorization: `Bearer ${call.apiKey}` },
      body: form,
      signal: call.signal,
    });
  } else {
    res = await fetch(`${base}/images/generations`, {
      method: "POST",
      headers: { authorization: `Bearer ${call.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: call.model, prompt: call.prompt, size, n: 1 }),
      signal: call.signal,
    });
  }
  if (!res.ok) throw mapOpenAiError(res.status, await res.text().catch(() => ""));

  const json = (await res.json()) as { data: { url?: string; b64_json?: string }[] };
  const d = json.data?.[0];
  if (!d) throw new ProviderError("no_output", "OpenAI returned no image", { provider: "openai" });
  let url = d.url ?? `data:image/png;base64,${d.b64_json}`;
  let width: number | undefined;
  let height: number | undefined;
  if (d.b64_json) {
    const buf = Buffer.from(d.b64_json, "base64");
    const sizeInfo = pngSize(buf);
    width = sizeInfo?.width;
    height = sizeInfo?.height;
  }
  return { url, model: call.model, width, height };
}

async function refToBlob(ref: string): Promise<Blob> {
  if (ref.startsWith("data:")) {
    const b64 = ref.slice(ref.indexOf(",") + 1);
    return new Blob([Buffer.from(b64, "base64")], { type: "image/png" });
  }
  const res = await fetch(ref).catch(() => null);
  if (!res?.ok) throw new ProviderError("network", `could not fetch reference image (HTTP ${res?.status ?? "network"})`, { provider: "openai" });
  return new Blob([Buffer.from(await res.arrayBuffer())], { type: "image/png" });
}

/** PNG IHDR reader (shared with the codex channel's size recording). */
export function pngSize(buf: Buffer): { width: number; height: number } | undefined {
  if (buf.length < 24 || buf.readUInt32BE(0) !== 0x89504e47) return undefined;
  return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
}
