import { readFile, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";

export const dynamic = "force-dynamic";
const LANGUAGES = ["en","zh","ja","ko","es","fr","it","ru","hi","id","tr","pl"];
function prefsFile() { return path.join(process.env.PIXFORGE_DATA_DIR ?? ".data", "user-prefs.json"); }
export async function GET() {
  try {
    const p = JSON.parse(await readFile(prefsFile(), "utf8"));
    return Response.json({ code: 0, data: { language: LANGUAGES.includes(p.language) ? p.language : "en" }, msg: "" });
  } catch { return Response.json({ code: 0, data: { language: "en" }, msg: "" }); }
}
export async function POST(req: Request) {
  const body = await req.json().catch(() => ({}));
  const language = String(body?.language ?? "en");
  if (!LANGUAGES.includes(language)) return Response.json({ code:1,data:null,msg:"Unsupported language. English is the default." }, { status:400 });
  const file = prefsFile(); await mkdir(path.dirname(file), { recursive:true }); await writeFile(file,JSON.stringify({language}));
  return Response.json({ code:0,data:{language},msg:"" });
}
