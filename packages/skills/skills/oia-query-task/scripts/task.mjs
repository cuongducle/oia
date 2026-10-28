#!/usr/bin/env node
import { loadConfig } from "./env.mjs";
const cfg = loadConfig();
const taskId = process.argv[2] ?? process.argv.includes("--task-id") ? process.argv[process.argv.indexOf("--task-id") + 1] : null;
if (!cfg.baseUrl || !taskId) { console.error(JSON.stringify({ ok: false, error: "--task-id and OIA_BASE_URL are required" })); process.exit(1); }
const r = await (await fetch(`${cfg.baseUrl}/tasks/${taskId}`, { headers: { authorization: cfg.apiKey } })).json();
console.log(JSON.stringify(r));
