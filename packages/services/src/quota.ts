import type { LlmProvider, ImageProvider, LlmMessage, LlmChatOpts, ImageGenInput, ImageGenResult, ProviderDiagnostic, ProviderCapabilities } from "@oia/providers";
import { ProviderError } from "@oia/providers";
import type { ErrorClass } from "@oia/schema";

/**
 * TP-D2 (D1) — quota accounting owned by the service layer so BOTH shells (web SSE and
 * desktop IPC) meter the same. Counters are in-memory per process (single-user posture);
 * a failed attempt counts as a spent turn — the provider may have consumed before failing.
 */
export interface QuotaCounters {
  day: string; // YYYY-MM-DD
  planner: number;
  image: number;
  limitHits: number;
}

export class QuotaMeter {
  private today: QuotaCounters = freshDay();
  private session = { planner: 0, image: 0 };
  recordTurn(kind: "planner" | "image") {
    this.rollDay();
    this.today[kind]++;
    this.session[kind]++;
  }
  recordLimitHit() {
    this.rollDay();
    this.today.limitHits++;
  }
  snapshot(): QuotaCounters & { session: { planner: number; image: number } } {
    this.rollDay();
    return { ...this.today, session: { ...this.session } };
  }
  private rollDay() {
    const today = new Date().toISOString().slice(0, 10);
    if (this.today.day !== today) this.today = freshDay();
  }
}
function freshDay(): QuotaCounters {
  return { day: new Date().toISOString().slice(0, 10), planner: 0, image: 0, limitHits: 0 };
}

/** Wrap a provider so every metered turn is counted and limit errors are parsed (TP.6). */
export function meterImage(inner: ImageProvider, meter: QuotaMeter): ImageProvider {
  return {
    name: inner.name,
    capabilities: inner.capabilities,
    isAvailable: () => inner.isAvailable(),
    async generate(input: ImageGenInput): Promise<ImageGenResult> {
      meter.recordTurn("image");
      try {
        return await inner.generate(input);
      } catch (err) {
        if (err instanceof ProviderError && err.errorClass === "quota_exceeded") meter.recordLimitHit();
        throw err;
      }
    },
  };
}

export function meterLlm(inner: LlmProvider, meter: QuotaMeter): LlmProvider {
  return {
    name: inner.name,
    capabilities: inner.capabilities,
    isAvailable: () => inner.isAvailable(),
    async chat(messages: LlmMessage[], opts?: LlmChatOpts): Promise<string> {
      meter.recordTurn("planner");
      try {
        return await inner.chat(messages, opts);
      } catch (err) {
        if (err instanceof ProviderError && err.errorClass === "quota_exceeded") meter.recordLimitHit();
        throw err;
      }
    },
  };
}

export interface ProviderStatus {
  image: { name: string; capabilities: ProviderCapabilities; diagnostic: ProviderDiagnostic };
  llm: { name: string; capabilities: ProviderCapabilities; diagnostic: ProviderDiagnostic };
  quota: QuotaCounters & { session: { planner: number; image: number } };
}

import type { ServiceContext } from "./context.js";

/** TP.6 — health snapshot over a service context (both shells render this the same way). */
export async function providerStatusSnapshot(ctx: ServiceContext): Promise<ProviderStatus> {
  const [imageDiag, llmDiag] = await Promise.all([ctx.chat.image.isAvailable(), ctx.chat.llm.isAvailable()]);
  return {
    image: { name: ctx.chat.image.name, capabilities: ctx.chat.image.capabilities, diagnostic: imageDiag },
    llm: { name: ctx.chat.llm.name, capabilities: ctx.chat.llm.capabilities, diagnostic: llmDiag },
    quota: ctx.chat.meter.snapshot(),
  };
}
