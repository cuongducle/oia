/**
 * D8 FINAL (owner, 2026-10-30): the desktop UI ships ENGLISH — this file is the
 * I18nKey SOURCE ONLY, trimmed from the web's 12-locale dictionary (reorg step 4e).
 * provider-errors.ts maps errorClass → key; renderer/lib/errors.ts owns the EN copy.
 * The web app keeps the full multilingual dictionary until it is deleted (step 6).
 */
const en = {
    "nav.home": "Home",
    "nav.workspace": "Workspace",
    "nav.brandkit": "Brand kit",
    "nav.toolbox": "Toolbox",
    "nav.agents": "For Agents",
    "home.hero": "Realize your ideas",
    "home.sub": "Create & edit visuals with AI — open-source, BYOK, layer-based (Fabric.js).",
    "home.placeholder": "What would you like to create today?",
    "home.generate": "Generate",
    "home.designing": "Designing…",
    "home.community": "Community",
    "home.brandkitHint": "create brand kit →",
    "editor.untitled": "Untitled project",
    "editor.export": "Export",
    "editor.download": "Download",
    "editor.all": "ALL",
    "editor.current": "Current",
    "toolbox.title": "Toolbox",
    "toolbox.aiSkills": "AI Skills",
    "toolbox.quickTools": "Quick Tools",
    "agents.title": "For Agents",
    "agents.newKey": "+ New key",
    // ---- Stage 0 keys, values translated per D8 (owner, 2026-10-30: English UI;
    // the plain-Vietnamese Stage-0 wording was superseded — EN copy of the same
    // one-sentence/one-action shape; the error copy mirrors errors.ts exactly).
    "mode.toggle": "Editable text right away",
    "mode.toggleHint": "Text-free base image — text content becomes an editable layer right away",
    "provider.mockBanner": "Trial mode — placeholder images, not real AI",
    "editor.stop": "Stop",
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
    "error.action.retry": "Retry",
    "error.action.login": "Log in again",
    "error.action.guide": "View guide",
    "error.hintLogin": "Open a terminal, run “codex login”, log in to ChatGPT, then try again.",
    "error.hintGuide": "See the README's Codex CLI section to install the AI tool.",
    "error.resetAt": "quota resets: {time}",
    "error.invalidRequest": "Invalid request — please try again.",
    "error.configMismatch": "Provider configuration is invalid (mock mixed with real). See the README.",
    "quota.chip": "AI today: {image} images · {planner} planner turns",
    "quota.limitHits": "{n} quota-limit hits",
} as const;

/** D8: this dictionary is the I18nKey SOURCE (en-only). Exported for the
 *  completeness/English-only gates in test/renderer-libs.test.ts. */
export const EN_MESSAGES = en;
export type I18nKey = keyof typeof en;
