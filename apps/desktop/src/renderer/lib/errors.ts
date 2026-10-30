import { presentError, type ErrorActionKind } from "@oia-web/libs/provider-errors";
import type { I18nKey } from "@oia-web/libs/i18n";

/**
 * D2 owner decision (2026-10-30): the desktop UI ships ENGLISH — no Vietnamese UI
 * strings anywhere in renderer code. Vietnamese is supported at the CONTENT level
 * only (Be Vietnam Pro font renders seller text in banners). The web app keeps its
 * Vietnamese-first i18n; the desktop reuses only the error CLASSIFICATION from
 * @oia-web/libs/provider-errors and maps keys to its own English copy.
 */
const EN: Partial<Record<I18nKey, string>> = {
  "error.provider_missing": "The AI tool (Codex CLI) is not installed yet. Install it, then try again.",
  "error.not_logged_in": "You are not logged in to ChatGPT on Codex yet. Log in, then try again.",
  "error.quota_exceeded": "You have used all AI turns in this quota window. Wait for the reset, then try again.",
  "error.rate_limited": "Too many requests at once. Wait a moment, then try again.",
  "error.content_refused": "The request was declined by the safety policy. Try rewording it.",
  "error.timeout": "Image generation took too long and timed out. Please try again.",
  "error.format_drift": "The AI tool's output format changed — Oia needs an update.",
  "error.no_output": "No image was received from the AI tool. Please try again.",
  "error.plan_parse_failed": "The planning step returned an error. Please try again.",
  "error.capability_unsupported": "The current provider does not support this feature.",
  "error.persistence_failed": "Could not save your data. Check the disk, then try again.",
  "error.network": "Network error. Check your connection, then try again.",
  "error.cancelled": "Image generation was stopped at your request.",
  "error.unknown": "Something went wrong for an unknown reason. Please try again.",
  "error.invalidRequest": "Invalid request — please try again.",
  "error.configMismatch": "Provider configuration is invalid (mock mixed with real). See the README.",
  "error.action.retry": "Retry",
  "error.action.login": "Log in again",
  "error.action.guide": "View guide",
  "error.resetAt": "quota resets: {time}",
};

export interface ErrorPresentationEn {
  message: string;
  actionKind: ErrorActionKind;
  actionLabel?: string;
}

/** errorClass → English message + ONE next action (same classes as the web shell). */
export function presentErrorEn(errorClass?: string | null): ErrorPresentationEn {
  const p = presentError(errorClass);
  return {
    message: EN[p.messageKey] ?? EN["error.unknown"]!,
    actionKind: p.actionKind,
    actionLabel: p.actionLabelKey ? EN[p.actionLabelKey] : undefined,
  };
}

/** The resetAt suffix (`quota resets: …`) — English copy for the shared key. */
export function resetAtLabel(resetAt: string): string {
  return (EN["error.resetAt"] ?? "quota resets: {time}").replace("{time}", resetAt);
}
