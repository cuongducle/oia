import { describe, it, expect } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.PIXFORGE_DATA_DIR = mkdtempSync(path.join(tmpdir(),"pf-ui-persist-"));
import { POST } from "../app/api/projects/route";
import { GET } from "../app/api/projects/[id]/route";
import { STUDIO_TEMPLATES } from "../libs/studio-templates";

// Regression found with Chrome capture: editor posted pages but API silently created a blank scene.
describe("Editor first save preserves actual pages", () => {
  it("creates a multi-page project with every scene layer and dimensions intact", async () => {
    const pages = STUDIO_TEMPLATES.slice(0,2).map((t,i)=>({id:`page_${i+1}`,name:`Page ${i+1}`,width:900,height:1200,canvas:t.scene}));
    const res = await POST(new Request("http://x/api/projects",{method:"POST",body:JSON.stringify({name:"Studio collection",pages})}));
    const j = await res.json();
    expect(j.code).toBe(0);
    expect(j.data.pages).toEqual(pages);
    const reloaded = await (await GET(new Request("http://x"),{params:Promise.resolve({id:j.data.id})})).json();
    expect(reloaded.data.pages).toEqual(pages);
  });
  it("rejects invalid pages rather than reporting success for a blank project", async () => {
    const res = await POST(new Request("http://x/api/projects",{method:"POST",body:JSON.stringify({pages:[]})}));
    expect(res.status).toBe(400);
    expect((await res.json()).code).not.toBe(0);
  });
});
