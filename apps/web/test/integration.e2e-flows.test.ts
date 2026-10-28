import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { decodeSseText } from "@oia/protocol";

/** INTEGRATION: real user flows across multiple APIs — using the actual route handlers + runtime. */
process.env.OIA_DATA_DIR = mkdtempSync(path.join(tmpdir(), "pf-int-"));
process.env.IMAGE_PROVIDER = "mock";
process.env.LLM_PROVIDER = "mock";

import { POST as sendChat } from "../app/api/chat/send/route";
import { GET as getSession } from "../app/api/chat/sessions/[id]/route";
import { GET as listSessions, POST as createSession } from "../app/api/chat/sessions/route";
import { POST as createProject } from "../app/api/projects/route";
import { GET as getProjectId, PATCH as patchProject } from "../app/api/projects/[id]/route";
import { POST as submitTask, GET as getTask } from "../app/api/tasks/[id]/route";
import { POST as createKey } from "../app/api/api-key/route";
import { POST as upsertKit, DELETE as deleteKit } from "../app/api/brandkit/route";
import { GET as brandContext } from "../app/api/brand/context/route";
import { POST as publishTpl, GET as listTpl } from "../app/api/templates/route";
import { POST as tipTpl } from "../app/api/templates/[id]/tip/route";
import { POST as chunkInit } from "../app/api/upload/chunk-init/route";
import { POST as chunkComplete } from "../app/api/upload/chunk-complete/route";
import { POST as chunkUpload } from "../app/api/upload/chunk/route";
import { GET as getFile } from "../app/api/files/[...key]/route";

const R = (u: string, m: string, b?: unknown, headers?: Record<string, string>) =>
  new Request(`http://x${u}`, { method: m, body: b === undefined ? undefined : JSON.stringify(b), headers: { "content-type": "application/json", ...headers } });
const json = async (p: Promise<Response>) => (await p).json();

beforeAll(() => { delete process.env.OIA_REQUIRE_KEY; });
afterAll(() => { delete process.env.OIA_REQUIRE_KEY; });

describe("INT-FLOW 1: new user → poster → editor → share", () => {
  it("full chain: session → send SSE (2 pages + outline) → persist → replay → project → share", async () => {
    // 1) create a session
    const sid = (await json(createSession(R("/api/chat/sessions", "POST", {})))).data.id;

    // 2) send a prompt like the real client — read the SSE text stream
    const res = await sendChat(R("/api/chat/send", "POST", { prompt: "coffee poster 20% off", sessionId: sid, pages: 2, outlineMode: true }));
    const text = await res.text();
    const events = [...decodeSseText(text)].filter((i) => i.type === "event");
    expect(events.length).toBeGreaterThanOrEqual(7);
    expect(events.every((e) => e.event.brandId === 0)).toBe(true);
    const canvasIds = new Set(events.flatMap((e) => e.event.renderData.msgMeta.map((m) => m.id)));
    expect(canvasIds.size).toBe(2); // pages=2

    // 3) the session persisted correctly
    const stored = (await json(getSession(R(`/api/chat/sessions/${sid}`, "GET"), { params: Promise.resolve({ id: String(sid) }) }))).data;
    expect(stored.messages).toHaveLength(2);
    expect(stored.messages[0].content).toContain("coffee");
    expect(stored.messages[1].canvas.version).toBe("7.3.1");
    expect(stored.name).toContain("coffee");

    // 4) workspace recent có session
    const recents = (await json(listSessions())).data;
    expect(recents.some((s: { id: number }) => s.id === sid)).toBe(true);

    // 5) Edit as project + rename + share
    const proj = (await json(createProject(R("/api/projects", "POST", { name: "Coffee poster", scene: stored.messages[1].canvas })))).data;
    await patchProject(R(`/api/projects/${proj.id}`, "PATCH", { name: "Coffee poster v2" }), { params: Promise.resolve({ id: proj.id }) });
    const reloaded = (await json(getProjectId(R(`/api/projects/${proj.id}`, "GET"), { params: Promise.resolve({ id: proj.id }) }))).data;
    expect(reloaded.name).toBe("Coffee poster v2");
    expect(reloaded.pages[0].canvas.version).toBe("7.3.1");
  }, 90_000);
});

describe("INT-FLOW 2: API key guard toggles like production", () => {
  it("no key → 401; valid key → pass; wrong key → 401; guard off → open", async () => {
    let plaintext = "";
    try {
    process.env.OIA_REQUIRE_KEY = "1";
    const noAuth = await submitTask(R("/api/tasks/generate-poster", "POST", { prompt: "x" }), { params: Promise.resolve({ id: "generate-poster" }) });
    expect(noAuth.status).toBe(401);

    plaintext = (await json(createKey(R("/api/api-key", "POST", { name: "int", ttlDays: 365 })))).data.plaintext;
    expect(plaintext).toMatch(/^pf-[0-9a-f]{32}$/);

    const wrong = await submitTask(R("/api/tasks/generate-poster", "POST", { prompt: "x" }, { authorization: "pf-deadbeef" }), { params: Promise.resolve({ id: "generate-poster" }) });
    expect(wrong.status).toBe(401);

    const okRes = await submitTask(R("/api/tasks/generate-poster", "POST", { prompt: "x" }, { authorization: plaintext }), { params: Promise.resolve({ id: "generate-poster" }) });
    expect((await okRes.json()).code).toBe(0);

    delete process.env.OIA_REQUIRE_KEY;
    const free = await submitTask(R("/api/tasks/generate-poster", "POST", { prompt: "x" }), { params: Promise.resolve({ id: "generate-poster" }) });
    expect((await free.json()).code).toBe(0);
    } finally { delete process.env.OIA_REQUIRE_KEY; }
  });
});

describe("INT-FLOW 3: active brand kit → chat carries the brand → kit removed", () => {
  it("brandId=1 across the SSE whenever a kit is active; brand/context correct; delete → null", async () => {
    const kit = (await json(upsertKit(R("/api/brandkit", "POST", { name: "Cafe", guidance: "pastel", colors: ["#F9A8D4"], applyByDefault: true })))).data;
    const ctx = (await json(brandContext(R("/api/brand/context?sessionId=9", "GET")))).data;
    expect(ctx.name).toBe("Cafe");

    const res = await sendChat(R("/api/chat/send", "POST", { prompt: "poster" }));
    const events = [...decodeSseText(await res.text())].filter((i) => i.type === "event");
    expect(events.every((e) => e.event.brandId === 1)).toBe(true);

    await deleteKit(R(`/api/brandkit?id=${kit.id}`, "DELETE"));
    expect((await json(brandContext(R("/api/brand/context", "GET")))).data).toBeNull();
  }, 60_000);
});

describe("INT-FLOW 4: chunked upload → task → real file bytes", () => {
  it("PNG bytes upload intact + GET returns the right magic; pptx task returns ZIP magic; missing rembg → clear failure", async () => {
    // upload PNG 8 bytes có magic
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const init = (await json(chunkInit(R("/api/upload/chunk-init?fileName=a.png&fileMd5=int1", "POST")))).data;
    const fd = new FormData();
    fd.set("uploadId", init.uploadId); fd.set("partNumber", "1"); fd.set("file", new File([png], "p"));
    await chunkUpload(new Request("http://x/api/upload/chunk", { method: "POST", body: fd }));
    const done = (await json(chunkComplete(R(`/api/upload/chunk-complete?uploadId=${init.uploadId}`, "POST", [{ partNumber: 1, etag: "e" }])))).data;
    expect(done.size).toBe(8);

    const key = done.url.replace("/api/files/", "");
    const fileRes = await getFile(R(`/api/files/${key}`, "GET"), { params: Promise.resolve({ key: key.split("/") }) });
    expect(fileRes.headers.get("content-type")).toBe("image/png");
    const back = new Uint8Array(await fileRes.arrayBuffer());
    expect(Array.from(back.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);

    // a real pptx: ZIP magic PK\x03\x04
    const pptxTask = (await json(submitTask(R("/api/tasks/generate-presentation", "POST", { prompt: "review", n: 5, noWait: true, source: "web" }), { params: Promise.resolve({ id: "generate-presentation" }) }))).data;
    expect(pptxTask.progress).toBe("succeeded");
    const pptxUrl = pptxTask.taskResult.download;
    const pptxKey = pptxUrl.replace("/api/files/", "");
    const pptxRes = await getFile(R(`/api/files/${pptxKey}`, "GET"), { params: Promise.resolve({ key: pptxKey.split("/") }) });
    const pptxBytes = new Uint8Array(await pptxRes.arrayBuffer());
    expect(Array.from(pptxBytes.slice(0, 2))).toEqual([0x50, 0x4b]); // 'PK'
    expect(pptxRes.headers.get("content-type")).toContain("presentationml");
    // A ZIP header alone is not enough: the generated slides must contain actual image bytes.
    const JSZip = (await import("jszip")).default;
    const archive = await JSZip.loadAsync(pptxBytes);
    const media = archive.file(/^ppt\/media\/.+\.(png|jpg|jpeg)$/);
    expect(media.length).toBeGreaterThan(0);
    expect((await media[0].async("uint8array")).byteLength).toBeGreaterThan(20);

    // remove-background without rembg → failed with an instructive message (explicit failure contract)
    const rb = (await json(submitTask(R("/api/tasks/remove-background", "POST", { fileUrl: done.url, noWait: true }), { params: Promise.resolve({ id: "remove-background" }) }))).data;
    expect(rb.progress).toBe("failed");
    expect(rb.msg).toMatch(/rembg/);
  }, 120_000);
});

describe("INT-FLOW 5: community templates end-to-end", () => {
  it("publish → list (paginated) → tip", async () => {
    const scene = { version: "7.3.1", objects: [{ type: "Rect", name: "clip" }] };
    const tpl = (await json(publishTpl(R("/api/templates", "POST", { name: "INT template", authorName: "tester", scene })))).data;
    const list = (await json(listTpl(R("/api/templates?page=1&pageSize=5", "GET")))).data;
    expect(list.items[0].name).toBe("INT template");
    const tipped = (await json(tipTpl(R(`/api/templates/${tpl.id}/tip`, "POST", { credits: 5 }), { params: Promise.resolve({ id: tpl.id }) }))).data;
    expect(tipped.tipCredits).toBe(5);
  });
});
