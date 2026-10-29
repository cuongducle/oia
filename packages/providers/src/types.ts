import type { ErrorClass, GenerationMode, ProviderCapabilities } from "@oia/schema";

export type { ErrorClass, GenerationMode, ProviderCapabilities };

/** BYOK adapter contracts — providers know nothing about scenes/agents. */

/**
 * TP.4 — the error taxonomy vehicle. Adapters normalize their quirks into the
 * 14 stable classes; rate limits must never be rewritten as timeouts and vice versa.
 */
export class ProviderError extends Error {
  readonly errorClass: ErrorClass;
  readonly provider?: string;
  readonly detail?: unknown;
  /** Q3: quota reset time when the provider shows one (ISO string). */
  readonly resetAt?: string;

  constructor(errorClass: ErrorClass, message: string, opts: { provider?: string; detail?: unknown; resetAt?: string } = {}) {
    super(message);
    this.name = "ProviderError";
    this.errorClass = errorClass;
    this.provider = opts.provider;
    this.detail = opts.detail;
    this.resetAt = opts.resetAt;
  }

  /** Best-effort coercion: unknown errors become `unknown`, ProviderErrors pass through. */
  static from(err: unknown, provider?: string): ProviderError {
    if (err instanceof ProviderError) return err;
    const message = err instanceof Error ? err.message : String(err);
    return new ProviderError("unknown", message, { provider, detail: err });
  }
}

/** TP.6 — structured availability diagnostic (binary / version / login / last error). */
export interface ProviderDiagnostic {
  ok: boolean;
  /** The error class when not ok (undefined when ok). */
  errorClass?: ErrorClass;
  binary?: string;
  version?: string;
  loggedIn?: boolean;
  detail?: string;
}

export interface ImageGenInput {
  prompt: string;
  width: number;
  height: number;
  /** TP.9 — reference images (product photos): http(s) URLs, data URLs, or absolute file paths. */
  referenceImages?: string[];
  /** TP.3 — generation mode; providers default to "poster" when absent. */
  mode?: GenerationMode;
  /** TP.5 — cooperative cancellation, threaded end to end. */
  signal?: AbortSignal;
  /** TP.4 — correlation id from the designer/route; providers forward it to CLI transcripts. */
  jobId?: string;
}

export interface ImageGenResult {
  url: string; // http(s) or data:
  provider: string;
  model: string;
  /** TP.8 — the actual output size, when knowable (PNG IHDR for the Codex channel). */
  width?: number;
  height?: number;
  /** How the output file was located (Codex channel): "parsed" (session dir) > "hint" (stdout marker) > "fallback-scan". */
  provenance?: "parsed" | "hint" | "fallback-scan";
  /** A6 — non-fatal diagnostics (e.g. "format_drift" when the locator fell back repeatedly). */
  warnings?: string[];
}

export interface ImageProvider {
  readonly name: string;
  /** TP.11 — capabilities are data: Home/editor read the declaration instead of hardcoding. */
  readonly capabilities: ProviderCapabilities;
  generate(input: ImageGenInput): Promise<ImageGenResult>;
  isAvailable(): Promise<ProviderDiagnostic>;
}

export interface LlmMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface LlmChatOpts {
  json?: boolean;
  signal?: AbortSignal;
  /** TP.4 — correlation id forwarded to CLI transcripts. */
  jobId?: string;
}

export interface LlmProvider {
  readonly name: string;
  readonly capabilities: ProviderCapabilities;
  chat(messages: LlmMessage[], opts?: LlmChatOpts): Promise<string>;
  isAvailable(): Promise<ProviderDiagnostic>;
}
