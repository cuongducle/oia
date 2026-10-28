"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Paperclip, SlidersHorizontal, ChevronDown, LockKeyhole, X, LoaderCircle, RectangleVertical, Presentation, PanelsTopLeft, Smartphone, Download, Pencil, Scan, Images } from "lucide-react";
import type { ChatEvent, CanvasMsgMeta, TaskMeta, BrandKit, Template } from "@oia/schema";
import { stripMarkers } from "@oia/protocol";
import { ScenePreview } from "@/components/ScenePreview";
import { Dialog } from "@/components/Dialog";
import { STUDIO_TEMPLATES } from "@/libs/studio-templates";
import { filterTemplates, templateCategory, type StudioCategory } from "@/libs/studio-ui";

const FORMATS = [
  { name: "Poster", Icon: RectangleVertical, prompt: "Design a poster for " },
  { name: "Social post", Icon: Smartphone, prompt: "Design a social media post for " },
  { name: "Presentation", Icon: Presentation, prompt: "Create a presentation about " },
  { name: "Banner", Icon: PanelsTopLeft, prompt: "Design a banner for " },
];
const CATEGORY_LABELS: Record<StudioCategory, string> = { all: "All", poster: "Poster", social: "Social", presentation: "Presentation", other: "Branding" };

export default function Home() {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [timeline, setTimeline] = useState<TaskMeta[]>([]);
  const [narrative, setNarrative] = useState("");
  const [canvasMeta, setCanvasMeta] = useState<CanvasMsgMeta | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);
  const [aspect, setAspect] = useState("auto");
  const [resolution, setResolution] = useState("2k");
  const [pages, setPages] = useState("auto");
  const [outlineMode, setOutlineMode] = useState(false);
  const [skill, setSkill] = useState("");
  const [advanced, setAdvanced] = useState(false);
  const [refs, setRefs] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [kitId, setKitId] = useState("");
  const [community, setCommunity] = useState<Template[]>([]);
  const [galleryTab, setGalleryTab] = useState<"featured" | "all">("featured");
  const [category, setCategory] = useState<StudioCategory>("all");
  const [activeFormat, setActiveFormat] = useState("Poster");

  useEffect(() => {
    const controller = new AbortController();
    void Promise.all([
      fetch("/api/brandkit", { signal: controller.signal }).then(r => r.json()).then(j => { if (j.code === 0) setKits(j.data); }),
      fetch("/api/templates?pageSize=100", { signal: controller.signal }).then(r => r.json()).then(j => { if (j.code === 0) setCommunity(j.data.items); }),
    ]).catch(e => { if (e.name !== "AbortError") setError("Community templates could not be loaded. You can still use the studio collection."); });
    const params = new URLSearchParams(location.search);
    if (params.get("brandKit")) setKitId(params.get("brandKit")!);
    const session = params.get("session");
    if (session) void fetch(`/api/chat/sessions/${session}`, { signal: controller.signal }).then(r => r.json()).then(j => {
      if (j.code !== 0) return;
      setSessionId(j.data.id);
      const messages = j.data.messages as { role: string; content?: string; canvas?: CanvasMsgMeta["canvas"] }[];
      const scene = [...messages].reverse().find(m => m.canvas)?.canvas;
      if (scene) setCanvasMeta({ id: "replay", type: "canvas", thumbnail: "", canvas: scene } as CanvasMsgMeta);
      setNarrative([...messages].reverse().find(m => m.role === "assistant")?.content ?? "");
    }).catch(() => {});
    return () => controller.abort();
  }, []);

  // Canvas attaches only after the result has committed. Avoid loading Fabric against a null ref.
  useEffect(() => {
    let cancelled = false;
    if (!canvasMeta) return;
    void (async () => {
      const { createEditor } = await import("@oia/canvas");
      if (cancelled || !canvasElRef.current) return;
      const c = fabricRef.current ?? await createEditor(canvasElRef.current);
      if (cancelled) { void c.dispose(); return; }
      fabricRef.current = c;
      await c.loadFromJSON(canvasMeta.canvas);
      if (cancelled) return;
      const clip = canvasMeta.canvas.objects.find(o => o.name === "clip");
      const w = clip?.width || 1360, h = clip?.height || 2048;
      c.setDimensions({ width: 600, height: Math.round(600 * h / w) }); c.setZoom(600 / w); c.requestRenderAll();
    })().catch(() => setError("The design could not be loaded. Try opening it in the editor."));
    return () => { cancelled = true; };
  }, [canvasMeta]);
  useEffect(() => () => { void fabricRef.current?.dispose(); }, []);
  useEffect(() => {
    if (!preview) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", esc); return () => window.removeEventListener("keydown", esc);
  }, [preview]);

  async function attachFile(file: File) {
    setUploading(true); setError("");
    try {
      const fd = new FormData(); fd.set("file", file);
      const j = await (await fetch("/api/upload/direct", { method: "POST", body: fd })).json();
      if (j.code !== 0) throw new Error(j.msg);
      setRefs(r => [...r, j.data.url]);
    } catch { setError("The reference image could not be uploaded. Please try again."); }
    finally { setUploading(false); }
  }
  async function submit() {
    if (!prompt.trim() || busy || uploading) return;
    setBusy(true); setError(""); setTimeline([]); setNarrative("");
    try {
      const base = aspect === "1:1" ? [1024,1024] : aspect === "3:4" ? [1024,1365] : aspect === "2:3" ? [1024,1536] : aspect === "9:16" ? [1080,1920] : [1360,2048];
      const scale = resolution === "1k" ? .75 : 1;
      const res = await fetch("/api/chat/send", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({
        prompt, brandKitId: kitId || undefined, sessionId: sessionId ?? undefined,
        ...(aspect !== "auto" || resolution !== "2k" ? { width: Math.round(base[0] * scale), height: Math.round(base[1] * scale) } : {}),
        ...(pages !== "auto" ? { pages: Number(pages) } : {}), ...(outlineMode ? { outlineMode: true } : {}),
        ...(skill ? { skill } : {}), ...(refs.length ? { referenceImages: refs } : {}),
      }) });
      if (!res.ok || !res.body) throw new Error("Could not connect to the assistant. Check your AI provider settings.");
      const reader = res.body.getReader(), decoder = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += decoder.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5); if (payload.trim() === "[Heartbeat]") continue;
          let ev: ChatEvent; try { ev = JSON.parse(payload); } catch { continue; }
          if (ev.error) setError(ev.error);
          if (ev.renderData?.taskMeta?.length) setTimeline(ev.renderData.taskMeta);
          if (ev.content) setNarrative(n => n + stripMarkers(ev.content) + " ");
          for (const meta of ev.renderData?.msgMeta ?? []) if (meta.type === "canvas") setCanvasMeta(meta);
        }
      }
    } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong. Please try again."); }
    finally { setBusy(false); }
  }
  function openTemplate(tpl: Template) {
    localStorage.setItem("oia:scene", JSON.stringify(tpl.scene));
    localStorage.setItem("oia:project", JSON.stringify({ name: tpl.name }));
    location.href = "/editor";
  }
  async function exportResult(format: "png" | "pdf" | "pptx" | "zip") {
    const c = fabricRef.current; if (!c) return;
    const oldZoom = c.getZoom(), oldW = c.getWidth(), oldH = c.getHeight();
    const clip = canvasMeta?.canvas.objects.find(o => o.name === "clip"); const w = clip?.width || 1360, h = clip?.height || 2048;
    c.setZoom(1); c.setDimensions({ width: w, height: h });
    try {
      const png = c.toDataURL({ format: "png", multiplier: 1 });
      const dl = (blob: Blob, name: string) => { const u = URL.createObjectURL(blob); const a = document.createElement("a"); a.href=u; a.download=name; a.click(); setTimeout(() => URL.revokeObjectURL(u),1000); };
      const blob = await (await fetch(png)).blob();
      if (format === "png") dl(blob,"oia.png");
      if (format === "pdf") { const { jsPDF } = await import("jspdf"); const pdf = new jsPDF({ orientation:w>h?"landscape":"portrait",unit:"px",format:[w,h] }); pdf.addImage(png,"PNG",0,0,w,h); dl(pdf.output("blob"),"oia.pdf"); }
      if (format === "zip") { const JSZip = (await import("jszip")).default; const zip = new JSZip(); zip.file("1.png",blob); dl(await zip.generateAsync({type:"blob"}),"oia.zip"); }
      if (format === "pptx") { localStorage.setItem("oia:scene",JSON.stringify(canvasMeta?.canvas)); location.href="/editor"; }
    } finally { c.setZoom(oldZoom); c.setDimensions({ width: oldW, height: oldH }); c.requestRenderAll(); }
  }
  const all = [...STUDIO_TEMPLATES, ...community];
  const visibleTemplates = filterTemplates(galleryTab === "featured" ? all.filter(t => t.featured) : all, category);

  return <main className="studioPage">
    <div className="studioTopline"><span>Studio</span><span className="privateNote"><LockKeyhole size={13} /> Your private creative space</span></div>
    <header className="studioHero"><h1>From a spark to something great.</h1><p>Your ideas. Your models. A little help bringing it all together.</p></header>
    <section className="promptCard" aria-label="Create a design">
      <textarea aria-label="Design idea" value={prompt} onChange={e => setPrompt(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void submit(); } }} placeholder="What would you like to create today?" rows={3} />
      <div className="composerControls">
        <button className="iconBtn" aria-label="Attach a reference image" disabled={uploading} onClick={()=>fileInputRef.current?.click()}>{uploading ? <LoaderCircle className="spin" size={18} /> : <Paperclip size={18} />}</button><input ref={fileInputRef} aria-label="Reference image file" type="file" accept="image/*" hidden onChange={e => { if (e.target.files?.[0]) void attachFile(e.target.files[0]); e.target.value=""; }} />
        <span className="composerDivider" />
        <select aria-label="Aspect ratio" value={aspect} onChange={e => setAspect(e.target.value)}><option value="auto">Auto ratio</option><option>1:1</option><option>3:4</option><option>2:3</option><option>9:16</option></select>
        <select aria-label="Resolution" value={resolution} onChange={e => setResolution(e.target.value)}><option value="2k">2K</option><option value="1k">1K</option></select>
        <span className="composerDivider" />
        <button className="advancedToggle" aria-expanded={advanced} aria-controls="advanced-settings" onClick={() => setAdvanced(!advanced)}><SlidersHorizontal size={16} /><span>Advanced settings</span><ChevronDown size={13} /></button>
        <button className="generateBtn" onClick={submit} disabled={busy || uploading || !prompt.trim()} aria-label={busy ? "Designing" : "Generate design"}>{busy ? <LoaderCircle className="spin" size={20} /> : <ArrowRight size={21} />}</button>
      </div>
      {advanced && <div id="advanced-settings" className="advancedSettings">
        <label className="field">Pages<select value={pages} onChange={e => setPages(e.target.value)}><option value="auto">Auto</option>{Array.from({length:9},(_,i)=><option key={i} value={i+1}>{i+1} {i===0?"page":"pages"}</option>)}</select></label>
        <label className="field">Skill<select value={skill} onChange={e => setSkill(e.target.value)}><option value="">Choose automatically</option>{["Long Image Maker","Xiaohongshu Post Maker","Presentation Maker","File Translator","Background Remover","Image Resizer"].map(s=><option key={s}>{s}</option>)}</select></label>
        <label className="field">Brand kit<select value={kitId} onChange={e=>setKitId(e.target.value)}><option value="">None</option>{kits.map(k=><option key={k.id} value={k.id}>{k.name}</option>)}</select></label>
        <label className="switchRow"><button type="button" role="switch" aria-checked={outlineMode} aria-label="Create an outline first" className={`switch ${outlineMode?"on":""}`} onClick={()=>setOutlineMode(!outlineMode)} />Create an outline first</label>
      </div>}
      {refs.length > 0 && <div className="attachmentList">{refs.map((u,i)=><div key={u} className="attachment"><img src={u} alt={`Reference ${i+1}`} /><button className="iconBtn" aria-label={`Remove reference image ${i+1}`} onClick={()=>setRefs(r=>r.filter(x=>x!==u))}><X size={13} /></button></div>)}</div>}
    </section>
    <div className="formatRow" aria-label="Suggested formats">{FORMATS.map(({name,Icon,prompt:p})=><button key={name} className={`formatBtn ${activeFormat===name?"active":""}`} onClick={()=>{setActiveFormat(name);setPrompt(p);}}><Icon size={17}/>{name}</button>)}</div>
    {error && <div role="alert" className="notice error">{error}</div>}
    {busy && <p className="hintP" role="status">Your assistant is designing. Your creation will appear here…</p>}
    {timeline.length>0 && <div className="timeline">{timeline.map(t=><div key={t.id} className={`t ${t.type} ${t.status==="1"?"done":""}`}>{t.content} · {t.status==="0"?"In progress":"Done"}</div>)}</div>}
    {narrative && <div className="narrative">{narrative.trim()}</div>}
    {canvasMeta && <section aria-label="Your design" style={{marginBottom:32}}>
      <div className="canvasWrap" style={{maxWidth:600,margin:"0 auto",overflow:"hidden"}}><canvas ref={canvasElRef}/></div>
      <div className="resultActions">
        <button onClick={()=>setPreview(canvasMeta.thumbnail || null)}><Scan size={14}/> Preview</button>
        <button onClick={()=>openTemplate({name:"Your design",scene:canvasMeta.canvas} as Template)}><Pencil size={14}/> Open editor</button>
        <button onClick={()=>{if(canvasMeta.thumbnail)setRefs(r=>[...r,canvasMeta.thumbnail!]);}}><Images size={14}/> Use as reference</button>
        <button onClick={()=>exportResult("png")}><Download size={14}/> PNG</button>
        <select aria-label="Export result" defaultValue="" onChange={e=>{if(e.target.value)void exportResult(e.target.value as "pdf"|"zip"|"pptx");e.target.value="";}}><option value="" disabled>Export…</option><option value="pdf">PDF</option><option value="zip">ZIP</option><option value="pptx">PPTX in editor</option></select>
      </div>
    </section>}
    <section aria-labelledby="gallery-title">
      <div className="sectionHeading"><h2 id="gallery-title">A little inspiration to get you going.</h2><div className="tabs" aria-label="Collections"><button className={`tabBtn ${galleryTab==="featured"?"active":""}`} aria-pressed={galleryTab==="featured"} onClick={()=>setGalleryTab("featured")}>Featured</button><button className={`tabBtn ${galleryTab==="all"?"active":""}`} aria-pressed={galleryTab==="all"} onClick={()=>setGalleryTab("all")}>All templates</button></div></div>
      {galleryTab==="all" && <div className="gallerySubTabs">{(Object.keys(CATEGORY_LABELS) as StudioCategory[]).map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{CATEGORY_LABELS[c]}</button>)}</div>}
      <div className="galleryGrid">{visibleTemplates.map(tpl=><button key={tpl.id} className="galleryCard" onClick={()=>openTemplate(tpl)} aria-label={`Open template ${tpl.name}`}>
        <div className="galleryThumb"><ScenePreview scene={tpl.scene} label={tpl.name}/></div><div className="galleryMeta"><strong>{tpl.name.split(" · ")[0]}</strong><span>{CATEGORY_LABELS[templateCategory(tpl.name)]} · {tpl.authorName}</span></div>
      </button>)}</div>
      {visibleTemplates.length===0 && <div className="emptyState"><p>No templates in this category yet.</p><button className="secondaryBtn" onClick={()=>setCategory("all")}>View all</button></div>}
    </section>
    {preview && <Dialog onClose={()=>setPreview(null)} label="Design preview" wide><button className="iconBtn" aria-label="Close preview" onClick={()=>setPreview(null)}><X size={18}/></button><img src={preview} alt="Your design" style={{display:"block",maxWidth:"100%",maxHeight:"75vh"}}/></Dialog>}
  </main>;
}
