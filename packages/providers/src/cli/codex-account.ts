import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import path from "node:path";

/**
 * D17 — what the signed-in ChatGPT plan lets Codex do, read from the login's own
 * id_token claim (`chatgpt_plan_type` in `$CODEX_HOME/auth.json`). Offline and
 * free: no generation is spent to find out the account cannot generate images.
 *
 * Only a plan we KNOW lacks the built-in image tool reads as "unavailable"; any
 * other plan, a missing file, or a malformed token reads as "unknown" — a false
 * warning would push a paying seller away from a working account.
 */

export type ImageGenAccess = "available" | "unavailable" | "unknown";

export interface CodexAccount {
  /** Raw claim value, e.g. "free" | "go" | "plus" | "pro" | "team"; null when unreadable. */
  planType: string | null;
  imageGen: ImageGenAccess;
}

/** Plans live-verified to lack the Codex image tool (D17: Free, 2026-11-04). */
const NO_IMAGE_PLANS = new Set(["free"]);
/** Paid plans that include Codex image generation (Go observed working 2026-11-04). */
const IMAGE_PLANS = new Set(["go", "plus", "pro", "team", "business", "enterprise", "edu"]);

export function imageGenAccessForPlan(planType: string | null): ImageGenAccess {
  if (!planType) return "unknown";
  const plan = planType.toLowerCase();
  if (NO_IMAGE_PLANS.has(plan)) return "unavailable";
  if (IMAGE_PLANS.has(plan)) return "available";
  return "unknown";
}

export function codexHomeDir(env: NodeJS.ProcessEnv = process.env): string {
  return env.CODEX_HOME?.trim() || path.join(homedir(), ".codex");
}

/** Decodes the JWT payload only — the token is never verified, logged, or forwarded. */
export function planTypeFromAuthJson(raw: string): string | null {
  let auth: unknown;
  try {
    auth = JSON.parse(raw);
  } catch {
    return null;
  }
  const idToken = readPath(auth, ["tokens", "id_token"]);
  if (typeof idToken !== "string") return null;
  const payloadPart = idToken.split(".")[1];
  if (!payloadPart) return null;
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(payloadPart, "base64url").toString("utf8"));
  } catch {
    return null;
  }
  const plan = readPath(payload, ["https://api.openai.com/auth", "chatgpt_plan_type"]);
  return typeof plan === "string" && plan.length > 0 ? plan : null;
}

export async function readCodexAccount(codexHome: string): Promise<CodexAccount> {
  let raw: string;
  try {
    raw = await readFile(path.join(codexHome, "auth.json"), "utf8");
  } catch {
    return { planType: null, imageGen: "unknown" };
  }
  const planType = planTypeFromAuthJson(raw);
  return { planType, imageGen: imageGenAccessForPlan(planType) };
}

function readPath(value: unknown, keys: string[]): unknown {
  let cur = value;
  for (const key of keys) {
    if (typeof cur !== "object" || cur === null || !(key in cur)) return undefined;
    cur = Reflect.get(cur, key);
  }
  return cur;
}
