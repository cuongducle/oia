import { loadConfig } from "./env.mjs";
const cfg = loadConfig();
console.log(JSON.stringify({ ok: Boolean(cfg.baseUrl && cfg.apiKey), baseUrl: cfg.baseUrl || "(missing)", apiKey: cfg.apiKey ? "(set)" : "(missing)" }));
