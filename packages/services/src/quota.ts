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

export interface QuotaCounters {
  day: string; // YYYY-MM-DD
  planner: number;
  image: number;
  limitHits: number;
}

/** Injected clock (tests roll the day deterministically; production = real time). */
export interface QuotaClock {
  now(): Date;
}

/**
 * TP-D2 (D1) — quota accounting owned by the service layer so BOTH shells (web SSE and
 * desktop IPC) meter the same. Counters are in-memory per process (single-user posture);
 * a failed attempt counts as a spent turn — the provider may have consumed before failing.
 *
 * Enforcement (hard rule 6 — quota is money): optional per-kind DAILY budgets. A budget
 * is checked BEFORE the provider is called: beginTurn throws `quota_exceeded` without
 * moving the spent counter, so the counters always equal turns that actually reached a
 * provider. Refusals are free — they increment limitHits only. Budgets reset at
 * midnight UTC with the day roll.
 */
export class QuotaMeter {
  private today: QuotaCounters;
  private session = { planner: 0, image: 0 };
  constructor(
    private opts: {
      imageDailyLimit?: number; // turns/day reaching the image provider (undefined = unlimited)
      llmDailyLimit?: number;
      clock?: QuotaClock;
    } = {},
  ) {
    // explicit assignment — a field initializer must not read the parameter property
    this.opts = opts;
    this.today = freshDay(this.clockNow().toISOString().slice(0, 10));
  }
  private clockNow(): Date {
    return this.opts.clock?.now() ?? new Date();
  }
  /** Admit + charge one turn — or refuse for free when the day's budget is spent. */
  beginTurn(kind: "planner" | "image"): void {
    this.rollDay();
    const limit = kind === "image" ? this.opts.imageDailyLimit : this.opts.llmDailyLimit;
    if (limit !== undefined && this.today[kind] >= limit) {
      this.today.limitHits++;
      const envName = kind === "image" ? "OIA_DAILY_IMAGE_LIMIT" : "OIA_DAILY_LLM_LIMIT";
      throw new ProviderError(
        "quota_exceeded",
        `daily ${kind} budget spent (${this.today[kind]}/${limit}) — resets at midnight UTC; raise ${envName} to spend more`,
        { provider: "quota", detail: { spent: this.today[kind], limit, kind } },
      );
    }
    this.today[kind]++;
    this.session[kind]++;
  }
  recordLimitHit() {
    this.rollDay();
    this.today.limitHits++;
  }
  limits(): { planner: number | null; image: number | null } {
    return {
      planner: this.opts.llmDailyLimit ?? null,
      image: this.opts.imageDailyLimit ?? null,
    };
  }
  snapshot(): QuotaCounters & { session: { planner: number; image: number }; limits: { planner: number | null; image: number | null } } {
    this.rollDay();
    return { ...this.today, session: { ...this.session }, limits: this.limits() };
  }
  private rollDay() {
    const today = this.clockNow().toISOString().slice(0, 10);
    if (this.today.day !== today) this.today = freshDay(today);
  }
}
function freshDay(day: string): QuotaCounters {
  return { day, planner: 0, image: 0, limitHits: 0 };
}

/** Wrap a provider so every metered turn is counted and limit errors are parsed (TP.6).
 *  Budget refusal happens BEFORE inner.generate — a refused turn never burns money. */
export function meterImage(inner: ImageProvider, meter: QuotaMeter): ImageProvider {
  return {
    name: inner.name,
    capabilities: inner.capabilities,
    isAvailable: () => inner.isAvailable(),
    async generate(input: ImageGenInput): Promise<ImageGenResult> {
      meter.beginTurn("image"); // throws quota_exceeded when the day's budget is spent
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
      meter.beginTurn("planner");
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
  /** B7 — stores whose LAST disk write failed (basename only: no absolute paths cross the wire). */
  persistence: { file: string; error: string; code: string | null; failedWrites: number }[];
}

import type { ServiceContext } from "./context.js";
import { basename } from "node:path";
import { persistenceWriteFailures } from "@oia/tasks";

/** TP.6 — health snapshot over a service context (both shells render this the same way). */
export async function providerStatusSnapshot(ctx: ServiceContext): Promise<ProviderStatus> {
  const [imageDiag, llmDiag] = await Promise.all([ctx.chat.image.isAvailable(), ctx.chat.llm.isAvailable()]);
  return {
    image: { name: ctx.chat.image.name, capabilities: ctx.chat.image.capabilities, diagnostic: imageDiag },
    llm: { name: ctx.chat.llm.name, capabilities: ctx.chat.llm.capabilities, diagnostic: llmDiag },
    quota: ctx.chat.meter.snapshot(),
    persistence: persistenceWriteFailures().map((f) => ({
      file: basename(f.file),
      error: f.error,
      code: f.code,
      failedWrites: f.failedWrites,
    })),
  };
}
