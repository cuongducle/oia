import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { GET, POST } from "../app/api/user/preferences/language/route";

describe("English language preference migration", () => {
  let dir: string;
  beforeEach(()=>{ dir=mkdtempSync(path.join(tmpdir(),"pf-lang-")); vi.stubEnv("OIA_DATA_DIR",dir); });
  afterEach(()=>vi.unstubAllEnvs());
  it("defaults to English on a fresh install", async()=>expect((await (await GET()).json()).data.language).toBe("en"));
  it("maps an existing Vietnamese preference back to English", async()=>{
    writeFileSync(path.join(dir,"user-prefs.json"),JSON.stringify({language:"vi"}));
    expect((await (await GET()).json()).data.language).toBe("en");
  });
  it("rejects Vietnamese with an English validation message", async()=>{
    const res=await POST(new Request("http://x",{method:"POST",body:JSON.stringify({language:"vi"})}));
    expect(res.status).toBe(400); expect((await res.json()).msg).toBe("Unsupported language. English is the default.");
  });
  it("persists English", async()=>{
    await POST(new Request("http://x",{method:"POST",body:JSON.stringify({language:"en"})}));
    expect((await (await GET()).json()).data.language).toBe("en");
  });
});
