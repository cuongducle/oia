#!/usr/bin/env node
// POST /tasks/generate-presentation (noWait) → poll → download URL.
import { loadConfig } from "./env.mjs";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const cfg = loadConfig();
if (!cfg.baseUrl) { console.error(JSON.stringify({ ok: false, error: "OIA_BASE_URL is not set (your self-hosted server)" })); process.exit(1); }

const body = {
  prompt: flag("prompt") ?? "",
  style: flag("style"),
  language: flag("language"),
  sessionId: flag("session-id") ? Number(flag("session-id")) : undefined,
  noWait: true,
  source: "skill",
};
const res = await fetch(`${cfg.baseUrl}/api/tasks/generate-presentation`, {
  method: "POST",
  headers: { "content-type": "application/json", authorization: cfg.apiKey },
  body: JSON.stringify(body),
});
const json = await res.json();
if (json.code !== 0) { console.error(JSON.stringify({ ok: false, error: json })); process.exit(1); }

if (flag("async") !== undefined) {
  console.log(JSON.stringify({ ok: true, async: true, ...json.data }));
} else {
  let t = json.data;
  for (let i = 0; i < 120 && t.progress === "processing"; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    t = await (await fetch(`${cfg.baseUrl}/api/tasks/${t.taskId}`, { headers: { authorization: cfg.apiKey } })).json().then((r) => r.data);
  }
  console.log(JSON.stringify({ ok: t.progress === "succeeded", ...t }));
}
