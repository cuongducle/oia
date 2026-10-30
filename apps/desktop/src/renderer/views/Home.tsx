import { useCallback, useEffect, useRef, useState } from "react";
import type { ChatEvent, CanvasMsgMeta, Template, SceneCanvas } from "@oia/schema";
import { stripMarkers } from "@oia/protocol";
import { STUDIO_TEMPLATES } from "../lib/studio-templates.js";
import { filterTemplates, templateCategory, type StudioCategory } from "../lib/studio-ui.js";
import { ScenePreview } from "../components/ScenePreview.js";
import { Dialog } from "../components/Dialog.js";
import RuntimePanel from "../RuntimePanel.js";
import { oia } from "../lib/bridge.js";
import { presentErrorEn, resetAtLabel } from "../lib/errors.js";
import { mapAssetUrls, unmapAssetUrls, toDisplayUrl } from "../../shared/assets.js";

/**
 * Home — studio refresh port of the web composer (docs/design-direction.md):
 * serif display hero, prompt card with attach/ratio/resolution, advanced pages +
 * outline, format quick-starts, and the template gallery with real scene previews.
 * Transport stays the D2 IPC bridge; asset URLs map /api/files ↔ oia://.
 *
 * UI copy is ENGLISH by owner decision (design doc, Q11): Vietnamese is supported
 * at the content/font level only, never in interface strings.
 */

const MODE_TOGGLE_LABEL = "Editable text right away";
const MOCK_BANNER = "Trial mode — placeholder images, not real AI";
const STOP_LABEL = "Stop";

const CATEGORY_LABELS: Record<StudioCategory, string> = { all: "All", poster: "Poster", social: "Social", presentation: "Presentation", other: "Branding" };
const FORMATS = [
  { name: "Poster", prompt: "Design a poster for " },
  { name: "Social post", prompt: "Design a social media post for " },
  { name: "Presentation", prompt: "Create a presentation about " },
  { name: "Banner", prompt: "Design a banner for " },
];
const ASPECTS: Record<string, [number, number] | null> = { auto: null, "1:1": [1024, 1024], "3:4": [1024, 1365], "2:3": [1024, 1536], "9:16": [1080, 1920] };

/** Minimal inline icon set (no lucide dependency in the desktop renderer). */
const Icon = {
  paperclip: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
  sliders: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M4 21v-7M4 10V3M12 21v-9M12 8V3M20 21v-5M20 12V3M1 14h6M9 8h6M17 16h6" /></svg>,
  chevron: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="m6 9 6 6 6-6" /></svg>,
  arrow: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  stop: <svg width="15" height="15" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" /></svg>,
  x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  pencil: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>,
  download: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>,
  images: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 19a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h2.5L9 4h6l1.5 3H19a2 2 0 0 1 2 2Z" /><circle cx="12" cy="13" r="3" /></svg>,
};

export interface HomeProps {
  /** Resume a conversation (recent conversations hand this in). */
  resumeSession?: number | null;
  onOpenProject: (id: string) => void;
}

export function Home({ resumeSession, onOpenProject }: HomeProps) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<{ content: string; done: boolean }[]>([]);
  const [narrative, setNarrative] = useState("");
  const [canvasMeta, setCanvasMeta] = useState<CanvasMsgMeta | null>(null);
  const [error, setError] = useState("");
  const [retryable, setRetryable] = useState(false);
  const [mockMode, setMockMode] = useState(false);
  const [quota, setQuota] = useState<{ planner: number; image: number; imageLimit: number | null } | null>(null);
  /** B7 — non-empty while any store's LAST disk write failed; null once saving recovers. */
  const [writeFailures, setWriteFailures] = useState<{ file: string; failedWrites: number }[] | null>(null);
  const [editableText, setEditableText] = useState(true); // clean-plate default ("editable text right away")
  const [sessionId] = useState<number | null>(resumeSession ?? null);
  const [community, setCommunity] = useState<Template[]>([]);
  // studio refresh composer state
  const [aspect, setAspect] = useState("auto");
  const [resolution, setResolution] = useState("2k");
  const [pages, setPages] = useState("auto");
  const [outlineMode, setOutlineMode] = useState(false);
  const [advanced, setAdvanced] = useState(false);
  const [refs, setRefs] = useState<string[]>([]); // canonical /api/files/… form
  const [uploading, setUploading] = useState(false);
  const [galleryTab, setGalleryTab] = useState<"featured" | "all">("featured");
  const [category, setCategory] = useState<StudioCategory>("all");
  const [activeFormat, setActiveFormat] = useState("Poster");
  const [preview, setPreview] = useState<string | null>(null);
  const [resultName, setResultName] = useState(""); // exportMeta.projectName — names the editor handoff even when the prompt state is empty (programmatic runs)
  const activeJobRef = useRef<string | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const offRef = useRef<(() => void) | null>(null);

  /** TP-D3: the runtime panel flips the provider mode — Home re-reads status when it does. */
  const refreshProviderStatus = useCallback(() => {
    void oia()
      .providerStatus()
      .then((s) => {
        setMockMode(s.image.capabilities.isMock);
        setQuota({ planner: s.quota.planner, image: s.quota.image, imageLimit: s.quota.limits.image });
        setWriteFailures(s.persistence.length > 0 ? s.persistence : null);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    refreshProviderStatus();
    void oia().listTemplates().then(setCommunity).catch(() => {}); // degradation lane: gallery works without a provider
    if (sessionId) {
      void oia().getSession(sessionId).then((s) => {
        if (!s) return;
        const messages = s.messages as { role: string; content?: string; canvas?: CanvasMsgMeta["canvas"] }[];
        const scene = [...messages].reverse().find((m) => m.canvas)?.canvas;
        if (scene) setCanvasMeta({ id: "replay", type: "canvas", thumbnail: "", canvas: scene } as CanvasMsgMeta);
        setNarrative([...messages].reverse().find((m) => m.role === "assistant")?.content ?? "");
      }).catch(() => {});
    }
    // chat events stream over the bridge subscription
    // events filtered to the ACTIVE job — a concurrent mock run cannot interleave
    offRef.current = oia().onChatEvent((ev) => {
      if (activeJobRef.current && ev.jobId && ev.jobId !== activeJobRef.current) return;
      if (ev.jobId) {
        activeJobRef.current ??= ev.jobId;
        setJobId(ev.jobId);
      }
      if (ev.status === "cancelled") {
        setError(presentErrorEn("cancelled").message);
        return;
      }
      if (ev.error) {
        const p = presentErrorEn(ev.errorClass);
        setError(ev.resetAt ? `${p.message} (${resetAtLabel(ev.resetAt)})` : p.message);
        setRetryable(p.actionKind === "retry");
      }
      if (ev.renderData?.taskMeta?.length) {
        setTimeline(ev.renderData.taskMeta.map((tm) => ({ content: tm.content, done: tm.status === "1" })));
      }
      if (ev.renderData?.exportMeta?.projectName) setResultName(ev.renderData.exportMeta.projectName);
      if (ev.content) setNarrative((n) => (n ? `${n}\n${stripMarkers(ev.content)}` : stripMarkers(ev.content)));
      for (const m of ev.renderData?.msgMeta ?? []) if (m.type === "canvas") setCanvasMeta(m);
    });
    return () => offRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // canvas preview — same fabric wrapper the web Home uses (@oia/canvas)
  useEffect(() => {
    let cancelled = false;
    if (!canvasMeta) return;
    void (async () => {
      const { createEditor } = await import("@oia/canvas");
      if (cancelled || !canvasElRef.current) return;
      const c = (fabricRef.current ?? (await createEditor(canvasElRef.current))) as import("fabric").Canvas;
      if (cancelled) return;
      fabricRef.current = c;
      await c.loadFromJSON(mapAssetUrls(canvasMeta.canvas));
      const clip = canvasMeta.canvas.objects.find((o) => o.name === "clip");
      const w = clip?.width || 1360;
      const h = clip?.height || 2048;
      c.setDimensions({ width: 600, height: Math.round((600 * h) / w) });
      c.setZoom(600 / w);
      c.requestRenderAll();
    })().catch((e) => setError(`The design could not be loaded: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      cancelled = true;
    };
  }, [canvasMeta]);
  useEffect(() => () => void fabricRef.current?.dispose(), []);
  useEffect(() => {
    if (!preview) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setPreview(null); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [preview]);

  async function attachFile(file: File) {
    setUploading(true); setError("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const up = await oia().uploadAsset(file.name, bytes);
      setRefs((r) => [...r, up.url]);
    } catch {
      setError("The reference image could not be uploaded. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  async function submit(retryOf?: string) {
    if (!prompt.trim() || busy || uploading) return;
    setBusy(true);
    activeJobRef.current = retryOf ? null : activeJobRef.current;
    if (!retryOf) activeJobRef.current = null;
    setError("");
    setRetryable(false);
    setTimeline([]);
    setNarrative("");
    setCanvasMeta(null);
    try {
      const base = ASPECTS[aspect] ?? [1360, 2048] as [number, number];
      const scale = resolution === "1k" ? 0.75 : 1;
      await oia().chatRun({
        prompt,
        ...(editableText ? { mode: "clean-plate" as const } : {}),
        ...(sessionId ? { sessionId } : {}),
        ...(aspect !== "auto" || resolution !== "2k" ? { width: Math.round(base[0] * scale), height: Math.round(base[1] * scale) } : {}),
        ...(pages !== "auto" ? { pages: Number(pages) } : {}),
        ...(outlineMode ? { outlineMode: true } : {}),
        ...(refs.length ? { referenceImages: refs } : {}),
        ...(retryOf ? { retryOf } : {}),
      });
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "IpcValidationError") setError("Invalid request — please try again.");
      else if (name === "ProviderConfigError") setError("Provider configuration is invalid (mock mixed with real). See the README.");
      else setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
      void oia()
        .providerStatus()
        .then((s) => {
          setQuota((prev) => (prev ? { ...prev, planner: s.quota.planner, image: s.quota.image } : { planner: s.quota.planner, image: s.quota.image, imageLimit: s.quota.limits.image }));
          setWriteFailures(s.persistence.length > 0 ? s.persistence : null);
        })
        .catch(() => {});
    }
  }
  async function stop() {
    if (jobId) await oia().cancelChat(jobId).catch(() => {});
    // the service emits the terminal cancelled event — do not abort locally
  }

  /** TP.7 — handoff by projectId only; the scene is persisted, never carried as a blob. */
  async function openInEditor(name: string, scene: SceneCanvas) {
    setError("");
    try {
      const p = await oia().createProject({ name, scene: unmapAssetUrls(scene) });
      onOpenProject(p.id);
    } catch {
      setError("The editor could not be opened. Please try again.");
    }
  }
  function openTemplate(tpl: Template) {
    void openInEditor(tpl.name, tpl.scene);
  }

  /** Full-resolution PNG via the native save dialog (export:save IPC — never a download anchor). */
  async function exportPng() {
    const c = fabricRef.current;
    if (!c || !canvasMeta) return;
    const clip = canvasMeta.canvas.objects.find((o) => o.name === "clip");
    const w = clip?.width || 1360, h = clip?.height || 2048;
    const oldZoom = c.getZoom(), oldW = c.getWidth(), oldH = c.getHeight();
    c.setZoom(1); c.setDimensions({ width: w, height: h });
    try {
      const dataUrl = c.toDataURL({ format: "png", multiplier: 1 });
      const blob = await (await fetch(dataUrl)).blob();
      await oia().saveExport("oia.png", new Uint8Array(await blob.arrayBuffer()));
    } finally {
      c.setZoom(oldZoom); c.setDimensions({ width: oldW, height: oldH }); c.requestRenderAll();
    }
  }

  const all = [...STUDIO_TEMPLATES, ...community];
  const visibleTemplates = filterTemplates(galleryTab === "featured" ? all.filter((t) => t.featured) : all, category);

  return (
    <main className="studioPage homeView">
      <div className="studioTopline"><span>Studio</span><span className="privateNote">Your private creative space</span></div>
      <header className="studioHero">
        <h1>From a spark to something great.</h1>
        <p>Your ideas. Your models. A little help bringing it all together.</p>
      </header>

      <section className="promptCard" aria-label="Create a design">
        <textarea
          aria-label="Design idea"
          value={prompt}
          placeholder="What would you like to create today?"
          rows={3}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composerControls">
          <button className="iconBtn" aria-label="Attach a reference image" title="Attach a reference image" disabled={uploading} onClick={() => fileInputRef.current?.click()}>
            {uploading ? <span className="spin" aria-label="Uploading">◌</span> : Icon.paperclip}
          </button>
          <input ref={fileInputRef} aria-label="Reference image file" type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.[0]) void attachFile(e.target.files[0]); e.target.value = ""; }} />
          <span className="composerDivider" />
          <select aria-label="Aspect ratio" value={aspect} onChange={(e) => setAspect(e.target.value)}>
            <option value="auto">Auto ratio</option><option>1:1</option><option>3:4</option><option>2:3</option><option>9:16</option>
          </select>
          <select aria-label="Resolution" value={resolution} onChange={(e) => setResolution(e.target.value)}>
            <option value="2k">2K</option><option value="1k">1K</option>
          </select>
          <span className="composerDivider" />
          <button className="advancedToggle" aria-expanded={advanced} aria-controls="advanced-settings" onClick={() => setAdvanced(!advanced)}>
            {Icon.sliders}<span>Advanced settings</span>{Icon.chevron}
          </button>
          {busy ? (
            <button className="generateBtn stop" aria-label={STOP_LABEL} title={STOP_LABEL} onClick={() => void stop()}>{Icon.stop}</button>
          ) : (
            <button className="generateBtn" aria-label="Generate design" disabled={!prompt.trim() || uploading} onClick={() => void submit()}>{Icon.arrow}</button>
          )}
        </div>
        {advanced && (
          <div id="advanced-settings" className="advancedSettings">
            <label className="field">Pages
              <select value={pages} onChange={(e) => setPages(e.target.value)}>
                <option value="auto">Auto</option>
                {Array.from({ length: 9 }, (_, i) => <option key={i} value={i + 1}>{i + 1} {i === 0 ? "page" : "pages"}</option>)}
              </select>
            </label>
            <label className="switchRow">
              <button type="button" role="switch" aria-checked={outlineMode} aria-label="Create an outline first" className={`switch ${outlineMode ? "on" : ""}`} onClick={() => setOutlineMode(!outlineMode)} />
              Create an outline first
            </label>
            <label className="switchRow">
              <button type="button" role="switch" aria-checked={editableText} aria-label={MODE_TOGGLE_LABEL} title="Generated banners arrive with separate editable text layers" className={`switch ${editableText ? "on" : ""}`} onClick={() => setEditableText(!editableText)} />
              {MODE_TOGGLE_LABEL}
            </label>
          </div>
        )}
        {refs.length > 0 && (
          <div className="attachmentList">
            {refs.map((u, i) => (
              <div key={u} className="attachment">
                <img src={toDisplayUrl(u)} alt={`Reference ${i + 1}`} />
                <button className="iconBtn" aria-label={`Remove reference image ${i + 1}`} onClick={() => setRefs((r) => r.filter((x) => x !== u))}>{Icon.x}</button>
              </div>
            ))}
          </div>
        )}
      </section>

      <div className="formatRow" aria-label="Suggested formats">
        {FORMATS.map(({ name, prompt: p }) => (
          <button key={name} className={`formatBtn ${activeFormat === name ? "active" : ""}`} onClick={() => { setActiveFormat(name); setPrompt(p); }}>
            {name}
          </button>
        ))}
      </div>

      {mockMode && <div className="notice warn" role="status">{MOCK_BANNER}</div>}
      {writeFailures && (
        <div className="notice warn" role="status">
          ⚠ Could not save some data to disk ({writeFailures.map((f) => `${f.file} ×${f.failedWrites}`).join(", ")}).
          Check free space or folder permissions — changes since the last successful save are at risk until saving works again.
        </div>
      )}
      {quota && !mockMode && (quota.image > 0 || quota.planner > 0) && (
        <p className="hintP" role="status">
          🪙 {quota.image}{quota.imageLimit !== null ? `/${quota.imageLimit}` : ""} images · {quota.planner} reads
        </p>
      )}

      <RuntimePanel onModeChanged={refreshProviderStatus} />

      {error && (
        <div className="notice error" role="alert">
          {error}
          {retryable && (
            <>
              {" · "}
              <button onClick={() => void submit(jobId ?? undefined)} style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", font: "inherit" }}>
                Retry
              </button>
            </>
          )}
        </div>
      )}
      {busy && <p className="hintP" role="status">Your assistant is designing. Your creation will appear here…</p>}

      {timeline.length > 0 && (
        <div className="timeline">
          {timeline.map((tl) => (
            <div key={tl.content} className={`tl ${tl.done ? "done" : ""}`}>
              {tl.content} {tl.done ? "· done" : "· running…"}
            </div>
          ))}
        </div>
      )}
      {narrative && <div className="narrative">{narrative.trim()}</div>}

      {canvasMeta && (
        <section className="result" aria-label="Your design" data-testid="home-result">
          <div className="canvasWrap">
            <canvas ref={canvasElRef} />
          </div>
          <div className="resultActions">
            {canvasMeta.thumbnail && <button onClick={() => setPreview(toDisplayUrl(canvasMeta.thumbnail!))}>Preview</button>}
            <button data-testid="open-editor" onClick={() => void openInEditor(resultName || prompt.slice(0, 60) || "New banner", canvasMeta.canvas)}>{Icon.pencil} Open in editor</button>
            {canvasMeta.thumbnail && <button onClick={() => setRefs((r) => [...r, canvasMeta.thumbnail!])}>{Icon.images} Use as reference</button>}
            <button onClick={() => void exportPng()}>{Icon.download} PNG</button>
          </div>
        </section>
      )}

      <section aria-labelledby="gallery-title">
        <div className="sectionHeading">
          <h2 id="gallery-title">A little inspiration to get you going.</h2>
          <div className="tabs" aria-label="Collections">
            <button className={`tabBtn ${galleryTab === "featured" ? "active" : ""}`} aria-pressed={galleryTab === "featured"} onClick={() => setGalleryTab("featured")}>Featured</button>
            <button className={`tabBtn ${galleryTab === "all" ? "active" : ""}`} aria-pressed={galleryTab === "all"} onClick={() => setGalleryTab("all")}>All templates</button>
          </div>
        </div>
        {galleryTab === "all" && (
          <div className="gallerySubTabs">
            {(Object.keys(CATEGORY_LABELS) as StudioCategory[]).map((c) => (
              <button key={c} aria-pressed={category === c} onClick={() => setCategory(c)}>{CATEGORY_LABELS[c]}</button>
            ))}
          </div>
        )}
        <div className="galleryGrid">
          {visibleTemplates.map((tpl) => (
            <button key={tpl.id} className="galleryCard" onClick={() => openTemplate(tpl)} aria-label={`Open template ${tpl.name}`}>
              <div className="galleryThumb"><ScenePreview scene={tpl.scene} label={tpl.name} /></div>
              <div className="galleryMeta">
                <strong>{tpl.name.split(" · ")[0]}</strong>
                <span>{CATEGORY_LABELS[templateCategory(tpl.name)]} · {tpl.authorName}</span>
              </div>
            </button>
          ))}
          {visibleTemplates.length === 0 && (
            <div className="emptyState"><p>No templates in this category yet.</p></div>
          )}
        </div>
      </section>

      {preview && (
        <Dialog onClose={() => setPreview(null)} label="Design preview" wide>
          <img src={preview} alt="Your design" style={{ display: "block", maxWidth: "100%", maxHeight: "75vh" }} />
        </Dialog>
      )}
    </main>
  );
}
