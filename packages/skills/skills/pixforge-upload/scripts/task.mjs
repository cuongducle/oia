#!/usr/bin/env node
import { loadConfig } from "./env.mjs";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
const cfg = loadConfig();
const file = process.argv[2];
if (!cfg.baseUrl || !file) { console.error(JSON.stringify({ ok: false, error: "a <file> argument and PIXFORGE_BASE_URL are required" })); process.exit(1); }
const buf = await readFile(file);
const fd = new FormData(); fd.set("file", new Blob([buf]), file.split("/").pop());
const j = await (await fetch(`${cfg.baseUrl}/upload/direct`, { method: "POST", headers: { authorization: cfg.apiKey }, body: fd })).json();
console.log(JSON.stringify(j));
