import type { ImageProvider, LlmProvider, ImageGenInput, ImageGenResult, ProviderDiagnostic, ProviderCapabilities, LlmMessage, LlmChatOpts } from "../index.js";
import { ProviderError } from "../index.js";
import type { ErrorClass } from "@oia/schema";

/**
 * Injectable failing providers (Group F): a configurable errorClass and latency,
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
    return { ok: true, detail: "failing mock — always available, generate() throws" };
  }
}

export class FailingMockLlmProvider implements LlmProvider {
  readonly name = "failing-mock";
  readonly capabilities: ProviderCapabilities = FAKE_CAPS;
  private calls = 0;
  constructor(private opts: FailingMockOptions = {}) {}

  async chat(_messages: LlmMessage[], _opts?: LlmChatOpts): Promise<string> {
    this.calls++;
    if (this.opts.latencyMs) await new Promise((r) => setTimeout(r, this.opts.latencyMs));
    const shouldFail = this.opts.failOnCall === undefined || this.calls === this.opts.failOnCall;
    if (shouldFail) {
      throw new ProviderError(this.opts.errorClass ?? "plan_parse_failed", this.opts.message ?? `failing-mock: ${this.opts.errorClass ?? "plan_parse_failed"}`, {
        provider: this.name,
      });
    }
    return JSON.stringify({ title: "OK", imagePrompt: "OK" });
  }

  async isAvailable(): Promise<ProviderDiagnostic> {
    return { ok: true, detail: "failing mock — always available, chat() throws" };
  }
}
