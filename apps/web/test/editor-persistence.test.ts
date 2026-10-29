import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.OIA_DATA_DIR = mkdtempSync(path.join(tmpdir(),"pf-ui-persist-"));
import { POST } from "../app/api/projects/route";
import { GET as GET_PROJECT } from "../app/api/projects/[id]/route";
import { GET as GET_FILE } from "../app/api/files/[...key]/route";
import { STUDIO_TEMPLATES } from "../libs/studio-templates";

const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==";

// Regression found with Chrome capture: editor posted pages but API silently created a blank scene.
describe("Editor first save preserves actual pages", () => {
  it("creates a multi-page project with every scene layer and dimensions intact", async () => {
    const pages = STUDIO_TEMPLATES.slice(0,2).map((t,i)=>({id:`page_${i+1}`,name:`Page ${i+1}`,width:900,height:1200,canvas:t.scene}));
    const res = await POST(new Request("http://x/api/projects",{method:"POST",body:JSON.stringify({name:"Studio collection",pages})}));
    const j = await res.json();
    expect(j.code).toBe(0);
    expect(j.data.pages).toEqual(pages);
    const reloaded = await (await GET_PROJECT(new Request("http://x"),{params:Promise.resolve({id:j.data.id})})).json();
    expect(reloaded.data.pages).toEqual(pages);
  });
  it("rejects invalid pages rather than reporting success for a blank project", async () => {
    const res = await POST(new Request("http://x/api/projects",{method:"POST",body:JSON.stringify({pages:[]})}));
    expect(res.status).toBe(400);
    expect((await res.json()).code).not.toBe(0);
  });
});

// STAGE-0 TP.7 (Slice 3): migrate-on-save at the API boundary — the Home→Editor handoff
// scene arrives with a base64 artwork (a Codex PNG); the stored project references the asset.
describe("Project create migrates base64 artwork to asset refs (no base64 in new saves)", () => {
  it("POST /api/projects with a data-URL scene → stored src is /api/files/<key>, servable, reloadable", async () => {
    const scene = {
      version: "7.3.1",
      objects: [
        { type: "Image", name: "artwork", left: 0, top: 0, width: 100, height: 100, src: `data:image/png;base64,${PNG_B64}`, visible: true },
      ],
    };
    const res = await POST(new Request("http://x/api/projects", { method: "POST", body: JSON.stringify({ name: "banner trà sữa", scene }) }));
    const j = await res.json();
    expect(j.code).toBe(0);
    const src = j.data.pages[0].canvas.objects[0].src as string;
    expect(src).toMatch(/^\/api\/files\//);
    expect(src).not.toContain("data:");

    // the asset is servable through the files route (same-origin, browser-loadable)
    const key = src.replace(/^\/api\/files\//, "");
    const fileRes = await GET_FILE(new Request(`http://x/api/files/${key}`), { params: Promise.resolve({ key: key.split("/") }) });
    expect(fileRes.status).toBe(200);
    expect(fileRes.headers.get("content-type")).toBe("image/png");
    const bytes = Buffer.from(await fileRes.arrayBuffer());
    expect(bytes.toString("base64")).toBe(PNG_B64);

    // reload by id: the project opens read-tolerant with the asset ref intact
    const reloaded = await (await GET_PROJECT(new Request("http://x"), { params: Promise.resolve({ id: j.data.id }) })).json();
    expect(reloaded.data.pages[0].canvas.objects[0].src).toBe(src);
  });
});
