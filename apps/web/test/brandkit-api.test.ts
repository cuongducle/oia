import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET as listKits, POST as upsertKit, DELETE as delKit } from "../app/api/brandkit/route";
import { POST as extract } from "../app/api/brandkit/extract/route";
import { GET as brandCtx } from "../app/api/brand/context/route";
import { GET as listTpl, POST as publishTpl } from "../app/api/templates/route";
import { POST as tipTpl } from "../app/api/templates/[id]/tip/route";

process.env.PIXFORGE_DATA_DIR = mkdtempSync(path.join(tmpdir(), "pf-m4-"));
process.env.LLM_PROVIDER = "mock";
beforeAll(() => { delete process.env.PIXFORGE_REQUIRE_KEY; });

const R = (u: string, m: string, b?: unknown) =>
  new Request(`http://x${u}`, { method: m, body: b === undefined ? undefined : JSON.stringify(b), headers: { "content-type": "application/json" } });

describe("BR-BK API /api/brandkit", () => {
  it("a valid kit → code 0", async () => {
    const j = await (await upsertKit(R("/api/brandkit", "POST", { name: "Matcha Studio", guidance: "pastel", colors: ["#F9A8D4"] }))).json();
    expect(j.code).toBe(0);
    expect(j.data.colors).toEqual(["#F9A8D4"]);
  });
  it("guidance of 2001 characters → 400 + msg", async () => {
    const res = await upsertKit(R("/api/brandkit", "POST", { name: "x", guidance: "a".repeat(2001) }));
    expect(res.status).toBe(400);
    expect((await res.json()).msg).toMatch(/guidance/);
  });
  it("brand/context returns the active kit after applyByDefault", async () => {
    const a = await (await upsertKit(R("/api/brandkit", "POST", { name: "Active kit", applyByDefault: true }))).json();
    const ctx = await (await brandCtx(R("/api/brand/context?sessionId=1", "GET"))).json();
    expect(ctx.data.name).toBe("Active kit");
    await delKit(R(`/api/brandkit?id=${a.data.id}`, "DELETE"));
    const ctx2 = await (await brandCtx(R("/api/brand/context", "GET"))).json();
    expect(ctx2.data === null || ctx2.data.applyByDefault === false).toBe(true);
  });
});

describe("BR-EX API /api/brandkit/extract (mock LLM)", () => {
  it("returns a safely clamped kit draft", async () => {
    const j = await (await extract(R("/api/brandkit/extract", "POST", { notes: "pastel pink" }))).json();
    expect(j.code).toBe(0);
    expect(j.data.colors.length).toBeLessThanOrEqual(10);
  });
});

describe("BR-TPL API /api/templates", () => {
  const scene = { version: "7.3.1", objects: [{ type: "Rect", name: "clip" }] };
  it("publish → list shows the template with the right pagination envelope", async () => {
    await publishTpl(R("/api/templates", "POST", { name: "Sample poster", authorName: "Alex", scene }));
    const j = await (await listTpl(R("/api/templates?page=1&pageSize=20", "GET"))).json();
    expect(j.code).toBe(0);
    expect(j.data.items.length).toBeGreaterThanOrEqual(1);
    expect(j.data.page).toBe(1);
  });
  it("tip → tipCredits increases", async () => {
    const t = await (await publishTpl(R("/api/templates", "POST", { name: "T", scene }))).json();
    const j = await (await tipTpl(R(`/api/templates/${t.data.id}/tip`, "POST", { credits: 2 }), { params: Promise.resolve({ id: t.data.id }) })).json();
    expect(j.data.tipCredits).toBe(2);
  });
});
