import { useEffect, useRef, useState } from "react";
import type { ChatEvent, CanvasMsgMeta, Template, SceneCanvas } from "@oia/schema";
import { stripMarkers } from "@oia/protocol";
import { STUDIO_TEMPLATES } from "@oia-web/libs/studio-templates";
import { oia } from "../lib/bridge.js";
import { presentErrorEn, resetAtLabel } from "../lib/errors.js";
import { mapAssetUrls, unmapAssetUrls } from "../../shared/assets.js";

/**
 * D2 renderer port — the banner Home flow: prompt → IPC chat stream → timeline →
 * asset-referenced canvas preview → "open in editor" by projectId (TP.7). Includes the
 * quick-start template gallery (studio seeds + the local community store) and session
 * resume (recent conversations land here from Workspace / the editor AI dock).
 *
 * UI copy is ENGLISH by owner decision (design doc, D2 remainder): Vietnamese is
 * supported at the content/font level only, never in interface strings.
 */

const MODE_TOGGLE_LABEL = "Editable text right away";
const MOCK_BANNER = "Trial mode — placeholder images, not real AI";
const STOP_LABEL = "Stop";

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
  const [quota, setQuota] = useState<{ planner: number; image: number } | null>(null);
  const [editableText, setEditableText] = useState(true); // clean-plate default ("editable text right away")
  const [sessionId] = useState<number | null>(resumeSession ?? null);
  const [community, setCommunity] = useState<Template[]>([]);
  const activeJobRef = useRef<string | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);
  const offRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    void oia().providerStatus()
      .then((s) => {
        setMockMode(s.image.capabilities.isMock);
        setQuota(s.quota);
      })
      .catch(() => {});
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
      if (ev.content) setNarrative((n) => n + stripMarkers(ev.content) + " ");
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
      c.setDimensions({ width: 520, height: Math.round((520 * h) / w) });
      c.setZoom(520 / w);
      c.requestRenderAll();
    })().catch((e) => setError(`The design could not be loaded: ${e instanceof Error ? e.message : String(e)}`));
    return () => {
      cancelled = true;
    };
  }, [canvasMeta]);
  useEffect(() => () => void fabricRef.current?.dispose(), []);

  async function submit() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    activeJobRef.current = null;
    setError("");
    setRetryable(false);
    setTimeline([]);
    setNarrative("");
    setCanvasMeta(null);
    try {
      await oia().chatRun({
        prompt,
        ...(editableText ? { mode: "clean-plate" as const } : {}),
        ...(sessionId ? { sessionId } : {}),
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
        .then((s) => setQuota(s.quota))
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

  const gallery: Template[] = [...STUDIO_TEMPLATES, ...community];

  return (
    <main className="appShell homeView">
      <div className="topline">
        <span>Oia — Studio</span>
        <span>{quota ? `🪙 ${quota.image} images · ${quota.planner} reads` : ""}</span>
      </div>
      <h1>From an idea to a beautiful banner.</h1>
      <p className="sub">Describe your banner in one sentence — editable text, marketplace-ready sizes.</p>

      {mockMode && <div className="notice warn" role="status">{MOCK_BANNER}</div>}

      <section className="composer">
        <textarea
          aria-label="Design idea"
          value={prompt}
          placeholder="e.g. milk tea 20% off banner for Nov 8"
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composerRow">
          <button type="button" className={`switch ${editableText ? "on" : ""}`} aria-label={MODE_TOGGLE_LABEL} onClick={() => setEditableText(!editableText)} />
          <span className="toggle" onClick={() => setEditableText(!editableText)}>{MODE_TOGGLE_LABEL}</span>
          <span className="spacer" />
          {busy ? (
            <button className="generate stop" aria-label={STOP_LABEL} title={STOP_LABEL} onClick={() => void stop()}>
              <svg width="12" height="12" viewBox="0 0 12 12"><rect width="12" height="12" rx="2" fill="#fff" /></svg>
            </button>
          ) : (
            <button className="generate" aria-label="Generate" disabled={!prompt.trim()} onClick={() => void submit()}>
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M5 12h14M13 6l6 6-6 6" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
            </button>
          )}
        </div>
      </section>

      {error && (
        <div className="notice error" role="alert">
          {error}
          {retryable && (
            <>
              {" · "}
              <button onClick={() => void submit()} style={{ border: "none", background: "none", color: "var(--accent)", cursor: "pointer", font: "inherit" }}>
                Retry
              </button>
            </>
          )}
        </div>
      )}

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
        <section className="result" data-testid="home-result">
          <div className="canvasWrap">
            <canvas ref={canvasElRef} />
          </div>
          <div className="resultActions">
            <button data-testid="open-editor" onClick={() => void openInEditor(prompt.slice(0, 60) || "New banner", canvasMeta.canvas)}>
              ✏️ Open in editor
            </button>
          </div>
        </section>
      )}

      <section className="gallerySection" aria-label="Quick-start templates">
        <h2>Start from a template</h2>
        <p className="sub">Pick a template, open it in the editor, and make it yours.</p>
        <div className="galleryGrid">
          {gallery.map((tpl) => (
            <button key={tpl.id} className="galleryCard" onClick={() => void openInEditor(tpl.name, tpl.scene)} title={tpl.name}>
              <span className="galleryName">{tpl.name}</span>
              <span className="galleryAuthor">{tpl.authorName}</span>
            </button>
          ))}
          {gallery.length === 0 && <p className="sub">No templates in your library yet.</p>}
        </div>
      </section>
    </main>
  );
}
