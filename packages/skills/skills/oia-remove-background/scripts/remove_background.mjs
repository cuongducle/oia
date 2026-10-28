#!/usr/bin/env node
// Upload (chunked) → POST /tasks/remove-background → poll → transparent PNG URL.
import { loadConfig } from "./env.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";

const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : undefined; };
const cfg = loadConfig();
if (!cfg.baseUrl) { console.error(JSON.stringify({ ok: false, error: "OIA_BASE_URL is not set" })); process.exit(1); }
const headers = { authorization: cfg.apiKey };

const file = flag("file") ?? args.find((a) => !a.startsWith("--"));
const buf = await readFile(file);
const md5 = createHash("md5").update(buf).digest("hex");
const init = await (await fetch(`${cfg.baseUrl}/api/upload/chunk-init?fileName=${encodeURIComponent(file.split("/").pop())}&fileMd5=${md5}`, { method: "POST", headers })).json();
let fileUrl = init.data?.url;
if (!fileUrl) {
  const parts = [];
  const fd = new FormData();
  fd.set("uploadId", init.data.uploadId); fd.set("partNumber", "1"); fd.set("file", new Blob([buf]));
  const p = await (await fetch(`${cfg.baseUrl}/api/upload/chunk`, { method: "POST", headers, body: fd })).json();
  parts.push({ partNumber: 1, etag: p.data.etag });
  const done = await (await fetch(`${cfg.baseUrl}/api/upload/chunk-complete?uploadId=${init.data.uploadId}`, { method: "POST", headers: { ...headers, "content-type": "application/json" }, body: JSON.stringify(parts) })).json();
  fileUrl = done.data.url;
}

const task = await (await fetch(`${cfg.baseUrl}/api/tasks/remove-background`, {
  method: "POST", headers: { ...headers, "content-type": "application/json" },
  body: JSON.stringify({ fileUrl, noWait: true, source: "skill" }),
})).json();
let t = task.data;
for (let i = 0; i < 60 && t.progress === "processing"; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  t = await (await fetch(`${cfg.baseUrl}/api/tasks/${t.taskId}`, { headers })).json().then((r) => r.data);
}
console.log(JSON.stringify({ ok: t.progress === "succeeded", ...t }));
