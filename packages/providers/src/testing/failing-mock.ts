import type { ImageProvider, LlmProvider, ImageGenInput, ImageGenResult, ProviderDiagnostic, ProviderCapabilities, LlmMessage, LlmChatOpts } from "../index.js";
import { ProviderError } from "../index.js";
import type { ErrorClass } from "@oia/schema";

/** Sleep that cuts short on abort — mirrors cooperative providers (TP.5). */
function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() { signal?.removeEventListener("abort", done); clearTimeout(t); resolve(); }
    signal?.addEventListener("abort", done, { once: true });
  });
}

/** Injectable failing providers (Group F): a configurable errorClass and latency,
 * shared by agent/tasks/web test suites — CI can exercise every failure path
 * without network or credentials.
 */

const FAKE_CAPS: ProviderCapabilities = {
  referenceImages: true,
  sizePolicy: { trueRatio: false, divisibleBy: null, ratioBounds: null, fixedSizes: null, orientationOnly: false },
  transparentBg: false,
  isMock: false,
};

export interface FailingMockOptions {
  errorClass?: ErrorClass;
  message?: string;
  latencyMs?: number;
  /** Fail only on the Nth call (default: every call). */
  failOnCall?: number;
  /** When false, isAvailable() reports the configured errorClass (pre-flight testing). */
  available?: boolean;
}

export class FailingMockImageProvider implements ImageProvider {
  readonly name = "failing-mock";
  readonly capabilities: ProviderCapabilities = FAKE_CAPS;
  private calls = 0;
  constructor(private opts: FailingMockOptions = {}) {}

  async generate(_input: ImageGenInput): Promise<ImageGenResult> {
    this.calls++;
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    const shouldFail = this.opts.failOnCall === undefined || this.calls === this.opts.failOnCall;
    if (shouldFail) {
      throw new ProviderError(this.opts.errorClass ?? "unknown", this.opts.message ?? `failing-mock: ${this.opts.errorClass ?? "unknown"}`, {
        provider: this.name,
      });
    }
    return { url: "data:image/png;base64,x", provider: this.name, model: "failing" };
  }

  async isAvailable(): Promise<ProviderDiagnostic> {
    if (this.opts.available === false) {
      return { ok: false, errorClass: this.opts.errorClass ?? "provider_missing", detail: "failing mock: configured unavailable" };
    }
    return { ok: true, detail: "failing mock — always available, generate() throws" };
  }
}

export class FailingMockLlmProvider implements LlmProvider {
  readonly name = "failing-mock";
  readonly capabilities: ProviderCapabilities = FAKE_CAPS;
  private calls = 0;
  constructor(private opts: FailingMockOptions = {}) {}

  async chat(_messages: LlmMessage[], opts?: LlmChatOpts): Promise<string> {
    this.calls++;
    await abortableSleep(this.opts.latencyMs ?? 0, opts?.signal);
    const shouldFail = this.opts.failOnCall === undefined || this.calls === this.opts.failOnCall;
    if (shouldFail) {
      throw new ProviderError(this.opts.errorClass ?? "plan_parse_failed", this.opts.message ?? `failing-mock: ${this.opts.errorClass ?? "plan_parse_failed"}`, {
        provider: this.name,
      });
    }
    return JSON.stringify({ title: "OK", imagePrompt: "OK" });
  }

  async isAvailable(): Promise<ProviderDiagnostic> {
    if (this.opts.available === false) {
      return { ok: false, errorClass: this.opts.errorClass ?? "provider_missing", detail: "failing mock: configured unavailable" };
    }
    return { ok: true, detail: "failing mock — always available, chat() throws" };
  }
}
