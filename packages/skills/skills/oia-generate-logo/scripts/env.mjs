// Shared env loader — never hardcodes the host (BYOK/self-host friendly).
import { existsSync, readFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

function apply(vars) {
  for (const [k, v] of Object.entries(vars)) if (v != null && process.env[k] === undefined) process.env[k] = String(v);
}
function parseDotEnv(t) {
  const out = {};
  for (const line of t.split("\n")) {
    const s = line.trim();
    if (!s || s.startsWith("#")) continue;
    const eq = s.indexOf("=");
    if (eq <= 0) continue;
    out[s.slice(0, eq).trim()] = s.slice(eq + 1).trim().replace(/^["']|["']$/g, "");
  }
  return out;
}
export function loadConfig() {
  let dir = process.cwd();
  while (dir) {
    for (const f of [".env", path.join(".claude", "settings.local.json")]) {
      const p = path.join(dir, f);
      if (existsSync(p)) {
        try {
          const raw = readFileSync(p, "utf8");
          apply(f.endsWith(".json") ? (JSON.parse(raw).env ?? {}) : parseDotEnv(raw));
        } catch {}
      }
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  apply(JSON.parse(existsSync(path.join(homedir(), ".claude", "settings.local.json"))
    ? readFileSync(path.join(homedir(), ".claude", "settings.local.json"), "utf8") : "{}").env ?? {});
  return {
    baseUrl: (process.env.OIA_BASE_URL ?? "").replace(/\/$/, ""),
    apiKey: process.env.OIA_API_KEY ?? "",
  };
}
