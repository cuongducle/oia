import type { ErrorClass } from "@oia/schema";
import { ERROR_CLASSES } from "@oia/schema";
import type { I18nKey } from "./i18n";

/**
 * TP.4 — the single errorClass → i18n-key mapping. Raw stderr, exit codes, and
 * mixed-language internals never reach the user: every class maps to one
 * plain-Vietnamese sentence and ONE next action ("Đăng nhập lại" / "Thử lại" / "Xem hướng dẫn").
 * The message text itself lives in i18n.ts.
 */

export type ErrorActionKind = "retry" | "login" | "guide" | "none";

export interface ErrorPresentation {
  messageKey: I18nKey;
  actionKind: ErrorActionKind;
  actionLabelKey?: I18nKey;
}

const ACTION_KEYS: Record<Exclude<ErrorActionKind, "none">, I18nKey> = {
  retry: "error.action.retry",
  login: "error.action.login",
  guide: "error.action.guide",
};

export const ERROR_PRESENTATION: Record<ErrorClass, ErrorPresentation> = {
  provider_missing: { messageKey: "error.provider_missing", actionKind: "guide", actionLabelKey: ACTION_KEYS.guide },
  not_logged_in: { messageKey: "error.not_logged_in", actionKind: "login", actionLabelKey: ACTION_KEYS.login },
  quota_exceeded: { messageKey: "error.quota_exceeded", actionKind: "retry", actionLabelKey: ACTION_KEYS.retry },
  rate_limited: { messageKey: "error.rate_limited", actionKind: "retry", actionLabelKey: ACTION_KEYS.retry },
  content_refused: { messageKey: "error.content_refused", actionKind: "retry", actionLabelKey: ACTION_KEYS.retry },
  timeout: { messageKey: "error.timeout", actionKind: "retry", actionLabelKey: ACTION_KEYS.retry },
  format_drift: { messageKey: "error.format_drift", actionKind: "guide", actionLabelKey: ACTION_KEYS.guide },
  no_output: { messageKey: "error.no_output", actionKind: "retry", actionLabelKey: ACTION_KEYS.retry },
  plan_parse_failed: { messageKey: "error.plan_parse_failed", actionKind: "retry", actionLabelKey: ACTION_KEYS.retry },
  capability_unsupported: { messageKey: "error.capability_unsupported", actionKind: "guide", actionLabelKey: ACTION_KEYS.guide },
  persistence_failed: { messageKey: "error.persistence_failed", actionKind: "retry", actionLabelKey: ACTION_KEYS.retry },
  network: { messageKey: "error.network", actionKind: "retry", actionLabelKey: ACTION_KEYS.retry },
  cancelled: { messageKey: "error.cancelled", actionKind: "none" },
  unknown: { messageKey: "error.unknown", actionKind: "retry", actionLabelKey: ACTION_KEYS.retry },
};

/** Tolerant lookup for anything arriving over the wire (unknown strings → `unknown`). */
export function presentError(errorClass?: string | null): ErrorPresentation {
  return ERROR_PRESENTATION[(errorClass ?? "unknown") as ErrorClass] ?? ERROR_PRESENTATION.unknown;
}

/** Guard: every class in the taxonomy has exactly one presentation (fails loud in tests). */
export function errorPresentationComplete(): boolean {
  return ERROR_CLASSES.every((c) => ERROR_PRESENTATION[c].messageKey.startsWith("error."));
}
