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

// Desktop loopback (D9): when OIA_BASE_URL is not set, auto-discover a local
// Oia desktop app via its agent-api.json discovery file (random port, 0600).
// The file carries the port + pid; a stale file (app closed) is skipped.
const DISCOVERY_FILES = [
  process.env.OIA_AGENT_DISCOVERY, // explicit path override
  path.join(homedir(), "Library", "Application Support", "@oia/desktop", "agent-api.json"), // macOS dev
  path.join(homedir(), "Library", "Application Support", "Oia", "agent-api.json"), // macOS packaged
  path.join(process.env.APPDATA ?? "", "@oia/desktop", "agent-api.json"), // Windows dev
  path.join(process.env.APPDATA ?? "", "Oia", "agent-api.json"), // Windows packaged
  path.join(homedir(), ".config", "@oia/desktop", "agent-api.json"), // Linux dev
  path.join(homedir(), ".config", "Oia", "agent-api.json"), // Linux packaged
].filter(Boolean);

function discoverBaseUrl() {
  for (const f of DISCOVERY_FILES) {
    if (!existsSync(f)) continue;
    try {
      const info = JSON.parse(readFileSync(f, "utf8"));
      if (typeof info.port !== "number") continue;
      try {
        if (typeof info.pid === "number") process.kill(info.pid, 0); // alive?
      } catch {
        continue; // stale discovery — the app is closed
      }
      return `http://127.0.0.1:${info.port}`;
    } catch {}
  }
  return "";
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
    baseUrl: (process.env.OIA_BASE_URL ?? "").replace(/\/$/, "") || discoverBaseUrl(),
    apiKey: process.env.OIA_API_KEY ?? "",
  };
}
