#!/usr/bin/env node
// POST /tasks/image-translate {imageUrls[], language} → poll → URL.
import { loadConfig } from "./env.mjs";
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const all = (n) => args.filter((_, i) => args[i - 1] === `--${n}`);
const cfg = loadConfig();
if (!cfg.baseUrl) { console.error(JSON.stringify({ ok: false, error: "PIXFORGE_BASE_URL is not set" })); process.exit(1); }
const headers = { "content-type": "application/json", authorization: cfg.apiKey };
const task = await (await fetch(`${cfg.baseUrl}/tasks/image-translate`, {
  method: "POST", headers,
  body: JSON.stringify({ imageUrls: all("url"), language: flag("language") ?? "en", noWait: true, source: "skill" }),
})).json();
if (task.code !== 0) { console.error(JSON.stringify({ ok: false, error: task })); process.exit(1); }
let t = task.data;
for (let i = 0; i < 120 && t.progress === "processing"; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  t = await (await fetch(`${cfg.baseUrl}/tasks/${t.taskId}`, { headers })).json().then((r) => r.data);
}
console.log(JSON.stringify({ ok: t.progress === "succeeded", ...t }));
