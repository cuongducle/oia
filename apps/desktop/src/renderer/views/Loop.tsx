import { useEffect, useRef, useState } from "react";
import type { CanvasMsgMeta, SceneCanvas, StylePresetId } from "@oia/schema";
import { AUTO_REFINE_MAX_ROUNDS_DEFAULT, STYLE_PRESETS } from "@oia/schema";
import { stripMarkers } from "@oia/protocol";
import { CostHint } from "../components/RunSteps.js";
import { RunPanel } from "../components/RunPanel.js";
import { costHintText, stepsFromTimeline, type TimelineEntry } from "../lib/run-steps.js";
import { sizeDims } from "../lib/composer-sizes.js";
import { readAutoRefinePref, readResearchPref, readStylePref, writeStylePref } from "../lib/composer-prefs.js";
import { oia } from "../lib/bridge.js";
import { flattenScenePng } from "../lib/scene-flatten.js";
import { presentErrorEn, resetAtLabel } from "../lib/errors.js";
import { viewportToNatural } from "../lib/markup-annotate.js";
import { drawMark, newMarkId, zoomAt, MIN_ARROW_PX, MIN_BOX_PX, type LoopMark } from "../lib/loop-marks.js";
import type { ChatRequest } from "@oia/services";

/**
 * SIL (docs/designs/single-image-loop.md): the single-image edit loop.
 * SL-1: generate ONE image (designer pipeline, pages=1, no outline gate),
 * flattened to a plain <img>, Save PNG. SL-2: numbered region marks (box +
 * arrow) drawn on a view-layer overlay with pan/zoom; marks live in view state
 * only and NEVER in any scene/store (ME-3 purity rule). One session per mount
 * like Home (C1 pin).
 *
 * UI copy is ENGLISH by owner decision (D8).
 */

const LOOP_ASPECTS: Record<string, [number, number] | null> = {
  auto: null, "1:1": [1024, 1024], "4:5": [1024, 1280], "2:3": [1024, 1536], "9:16": [1080, 1920], "16:9": [1920, 1080],
};

const HOW_IT_WORKS = "One image at a time: describe it, generate, then mark what to change next.";
const STOP_LABEL = "Stop";
const MARK_HINT = "Drag on the image to mark a region";

const Icon = {
  arrow: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  stop: <svg width="15" height="15" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" /></svg>,
  download: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>,
  pan: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>,
  box: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"><rect x="4" y="5" width="16" height="14" rx="2" strokeDasharray="3.4 2.6" /></svg>,
  arrowUp: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19 19 5" /><path d="M9 5h10v10" /></svg>,
  x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
};

type Tool = "pan" | "box" | "arrow";

/** One flat image in the session history; only real jobs push entries (B7). */
interface LoopVersion {
  dataUrl: string;
  width: number;
  height: number;
  label: string;
  jobId: string | null;
}

export function Loop() {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("auto");
  const [stylePreset, setStylePreset] = useState(() => readStylePref());
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [narrative, setNarrative] = useState("");
  const [error, setError] = useState("");
  const [mockMode, setMockMode] = useState(false);
  const [versions, setVersions] = useState<LoopVersion[]>([]);
  const [flattenFailed, setFlattenFailed] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [genSeconds, setGenSeconds] = useState<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const activeJobRef = useRef<string | null>(null);
  const offRef = useRef<(() => void) | null>(null);

  // ---- SL-2: marks + stage view transform ----
  const [tool, setTool] = useState<Tool>("pan");
  const [marks, setMarks] = useState<LoopMark[]>([]);
  /** fitted display size of the current image inside the stage (css px, zoom 1) */
  const [fit, setFit] = useState<{ w: number; h: number } | null>(null);
  /** view transform: viewport = worldCss * s + t (world = fitted image plane) */
  const viewRef = useRef({ s: 1, tx: 0, ty: 0 });
  const draftRef = useRef<{ kind: "box" | "arrow"; from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const rafRef = useRef(0);

  /** One clock like Home (ref feeds the ✓ summary, state feeds the timer). */
  function markRunStart(ms: number | null): void {
    startedAtRef.current = ms;
    setStartedAt(ms);
  }

  useEffect(() => {
    void oia().providerStatus().then((s) => setMockMode(s.image.capabilities.isMock)).catch(() => {});
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
      }
      if (ev.renderData?.taskMeta?.length) {
        setTimeline(ev.renderData.taskMeta.map((tm) => ({ content: tm.content, done: tm.status === "1", sub: tm.type === "substep" })));
      }
      if (ev.content) setNarrative((n) => (n ? `${n}\n${stripMarkers(ev.content)}` : stripMarkers(ev.content)));
      for (const m of ev.renderData?.msgMeta ?? []) if (m.type === "canvas") {
        void adoptCanvas(m);
      }
    });
    return () => offRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Canvas event → the loop's flat PNG. A single job can yield SEVERAL canvas
   * events (auto refine rounds re-generate); each job owns exactly ONE version
   * slot, later candidates REPLACE the job's earlier ones (the last canvas is
   * the winner the designer yields). B7: nothing but a real job pushes history. */
  async function adoptCanvas(m: CanvasMsgMeta) {
    try {
      const flat = await flattenScenePng(m.canvas as SceneCanvas);
      setFlattenFailed("");
      const jobId = activeJobRef.current;
      setVersions((v) => {
        const last = v[v.length - 1];
        if (last && last.jobId === jobId) {
          return [...v.slice(0, -1), { ...flat, label: last.label, jobId }];
        }
        return [...v, { ...flat, label: "Generated", jobId }];
      });
      setMarks([]); // a different image invalidates old regions
      viewRef.current = { s: 1, tx: 0, ty: 0 };
      setFit(null); // recompute for the new dimensions
      setNotesOpen(false);
      if (startedAtRef.current) setGenSeconds(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
    } catch (e) {
      setFlattenFailed(`The result could not be prepared for the loop: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function submit() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setNotesOpen(true);
    markRunStart(Date.now());
    setGenSeconds(null);
    activeJobRef.current = null;
    setError("");
    setFlattenFailed("");
    setTimeline([]);
    setNarrative("");
    const [w, h] = sizeDims(aspect, LOOP_ASPECTS) ?? ([1024, 1024] as [number, number]);
    const researchOn = readResearchPref();
    const autoRefineOn = readAutoRefinePref();
    const req: ChatRequest = {
      prompt,
      pages: 1,
      ...(sessionId ? { sessionId } : {}),
      ...(aspect !== "auto" ? { width: w, height: h } : {}),
      ...(researchOn ? { research: true } : {}),
      ...(stylePreset ? { style: stylePreset } : {}),
      ...(autoRefineOn ? { selfImprove: true } : {}),
    };
    try {
      const res = await oia().chatRun(req);
      setSessionId(res.sessionId);
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "IpcValidationError") setError("Invalid request, please try again.");
      else if (name === "ProviderConfigError") setError("Provider configuration is invalid (mock mixed with real). See the README.");
      else setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (jobId) await oia().cancelChat(jobId).catch(() => {});
  }

  /** Full-resolution PNG via the native save dialog, same channel Home uses. */
  async function savePng() {
    const v = versions[versions.length - 1];
    if (!v) return;
    try {
      const blob = await (await fetch(v.dataUrl)).blob();
      await oia().saveExport("oia-loop.png", new Uint8Array(await blob.arrayBuffer()));
    } catch {
      setError("The image could not be saved. Please try again.");
    }
  }

  function startOver() {
    setVersions([]);
    setMarks([]);
    setFit(null);
    setPrompt("");
    setSessionId(null);
    setNarrative("");
    setTimeline([]);
    setError("");
    setFlattenFailed("");
    setGenSeconds(null);
    markRunStart(null);
  }

  const current = versions[versions.length - 1] ?? null;
  const autoRefineOn = readAutoRefinePref();

  // ---- SL-2 stage: fit the image into the stage once, keep mapping stable --
  useEffect(() => {
    if (!current || fit) return;
    const stage = stageRef.current;
    if (!stage) return;
    const cw = stage.clientWidth || 1;
    const ch = stage.clientHeight || 1;
    const k = Math.min(cw / current.width, ch / current.height) * 0.96;
    setFit({ w: Math.max(1, Math.round(current.width * k)), h: Math.max(1, Math.round(current.height * k)) });
  }, [current, fit]);

  /** viewport (overlay css px) → natural image px, the ME mapping with an
   * identity object matrix (the <img> is never rotated). */
  function toNatural(clientX: number, clientY: number): { x: number; y: number } {
    const ov = overlayRef.current;
    const cur = versions[versions.length - 1];
    if (!ov || !cur || !fit) return { x: 0, y: 0 };
    const r = ov.getBoundingClientRect();
    const { s, tx, ty } = viewRef.current;
    return viewportToNatural({ x: clientX - r.left, y: clientY - r.top }, [s, 0, 0, s, tx, ty], [1, 0, 0, 1, 0, 0], fit.w, fit.h, cur.width, cur.height);
  }

  /** rAF overlay: image pixel-truth partner of the ME overlay (C3 lesson:
   * the canvas carries CSS size 100%, attrs follow dpr × rect). */
  useEffect(() => {
    if (!current || !fit) return;
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      const ov = overlayRef.current;
      const cur = versions[versions.length - 1];
      if (!ov || !cur) return;
      const rect = ov.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) return;
      const dpr = window.devicePixelRatio || 1;
      const w = Math.round(rect.width * dpr);
      const h = Math.round(rect.height * dpr);
      if (ov.width !== w || ov.height !== h) {
        ov.width = w;
        ov.height = h;
      }
      const ctx = ov.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, rect.width, rect.height);
      const { s, tx, ty } = viewRef.current;
      if (worldRef.current) worldRef.current.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      const k = fit.w / cur.width;
      ctx.translate(tx, ty);
      ctx.scale(s, s);
      ctx.scale(k, k);
      marks.forEach((m, i) => drawMark(ctx, m, i, cur.width, cur.height));
      const d = draftRef.current;
      if (d) {
        const draftMark: LoopMark =
          d.kind === "box"
            ? { id: "draft", kind: "box", note: "", x: Math.min(d.from.x, d.to.x), y: Math.min(d.from.y, d.to.y), w: Math.abs(d.to.x - d.from.x), h: Math.abs(d.to.y - d.from.y) }
            : { id: "draft", kind: "arrow", note: "", from: d.from, to: d.to };
        drawMark(ctx, draftMark, marks.length, cur.width, cur.height);
      }
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [current, fit, marks]);

  function onOverlayPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!current || !fit) return;
    // synthetic/untracked pointers cannot capture (same lesson as the ME overlay)
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the draft already started */ }
    if (tool === "pan") {
      panRef.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
      return;
    }
    draftRef.current = { kind: tool, from: toNatural(e.clientX, e.clientY), to: toNatural(e.clientX, e.clientY) };
  }

  function onOverlayPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const pan = panRef.current;
    if (pan) {
      viewRef.current.tx = pan.tx + (e.clientX - pan.x);
      viewRef.current.ty = pan.ty + (e.clientY - pan.y);
      return;
    }
    const d = draftRef.current;
    if (d) d.to = toNatural(e.clientX, e.clientY);
  }

  function onOverlayPointerUp() {
    const pan = panRef.current;
    if (pan) {
      panRef.current = null;
      return;
    }
    const d = draftRef.current;
    draftRef.current = null;
    if (!d) return;
    if (d.kind === "box") {
      if (d.to.x - d.from.x >= MIN_BOX_PX || d.from.x - d.to.x >= MIN_BOX_PX || d.to.y - d.from.y >= MIN_BOX_PX || d.from.y - d.to.y >= MIN_BOX_PX) {
        setMarks((m) => [...m, { id: newMarkId(), kind: "box", note: "", x: Math.min(d.from.x, d.to.x), y: Math.min(d.from.y, d.to.y), w: Math.abs(d.to.x - d.from.x), h: Math.abs(d.to.y - d.from.y) }]);
      }
      return;
    }
    if (Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) >= MIN_ARROW_PX) {
      setMarks((m) => [...m, { id: newMarkId(), kind: "arrow", note: "", from: d.from, to: d.to }]);
    }
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (!current) return;
    e.preventDefault();
    const ov = overlayRef.current;
    if (!ov) return;
    const r = ov.getBoundingClientRect();
    const v = zoomAt(viewRef.current, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
    viewRef.current = v;
  }

  // Esc kills the in-progress draft; nothing was sent, nothing was burned (ME)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && draftRef.current) draftRef.current = null;
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function updateNote(id: string, note: string) {
    setMarks((m) => m.map((k) => (k.id === id ? ({ ...k, note } as LoopMark) : k)));
  }
  function removeMark(id: string) {
    setMarks((m) => m.filter((k) => k.id !== id));
  }

  return (
    <main className="studioPage loopView" aria-label="Edit loop">
      <header className="loopHead">
        <h1>Edit loop</h1>
        <p>{HOW_IT_WORKS}</p>
      </header>

      <section className="promptCard loopComposer" aria-label="Generate one image">
        <textarea
          aria-label="Image idea"
          data-testid="loop-idea"
          value={prompt}
          placeholder={current ? "Describe the next image…" : "What would you like to generate?"}
          rows={2}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composerControls">
          <select aria-label="Aspect ratio" value={aspect} onChange={(e) => setAspect(e.target.value)}>
            <option value="auto">Auto ratio</option>
            {Object.keys(LOOP_ASPECTS).filter((a) => a !== "auto").map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Style preset" data-testid="loop-style" value={stylePreset} onChange={(e) => { const v = e.target.value as StylePresetId | ""; setStylePreset(v); writeStylePref(v); }}>
            <option value="">Auto style</option>
            {STYLE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="composerSpacer" />
          {!busy && (
            <CostHint
              testId="loop-cost"
              text={costHintText({ images: 1, isMock: mockMode, autoRefineRounds: autoRefineOn ? AUTO_REFINE_MAX_ROUNDS_DEFAULT : 0 })}
            />
          )}
          {busy ? (
            <button className="generateBtn labeled stop" aria-label={STOP_LABEL} title={STOP_LABEL} onClick={() => void stop()}>{Icon.stop}Stop</button>
          ) : (
            <button className="generateBtn labeled" aria-label="Generate image" data-testid="loop-generate" disabled={!prompt.trim()} onClick={() => void submit()}>Generate{Icon.arrow}</button>
          )}
        </div>
      </section>

      {(error || flattenFailed) && (
        <div className="notice error" role="alert">{error || flattenFailed}</div>
      )}

      {current && (
        <section className="loopWork" aria-label="Mark and edit">
          <div className="loopStageCol">
            <div className="loopTools" role="toolbar" aria-label="Marking tools">
              <button className={`loopTool ${tool === "pan" ? "active" : ""}`} data-testid="tool-pan" aria-pressed={tool === "pan"} title="Pan and zoom" onClick={() => setTool("pan")}>{Icon.pan}<span>Pan</span></button>
              <button className={`loopTool ${tool === "box" ? "active" : ""}`} data-testid="tool-box" aria-pressed={tool === "box"} title="Draw a box around a region" onClick={() => setTool("box")}>{Icon.box}<span>Box</span></button>
              <button className={`loopTool ${tool === "arrow" ? "active" : ""}`} data-testid="tool-arrow" aria-pressed={tool === "arrow"} title="Point at a spot with an arrow" onClick={() => setTool("arrow")}>{Icon.arrowUp}<span>Arrow</span></button>
              {tool !== "pan" && <span className="loopHint">{MARK_HINT}</span>}
            </div>
            <div className="loopStage" ref={stageRef} data-testid="loop-stage">
              {fit && (
                <div className="loopWorld" ref={worldRef}>
                  {/* eslint-disable-next-line jsx-a11y/alt-text */}
                  <img data-testid="loop-image" src={current.dataUrl} alt="The current loop image" width={fit.w} height={fit.h} draggable={false} />
                </div>
              )}
              <canvas
                ref={overlayRef}
                className="loopOverlay"
                data-testid="loop-overlay"
                style={{ cursor: tool === "pan" ? "grab" : "crosshair" }}
                onPointerDown={onOverlayPointerDown}
                onPointerMove={onOverlayPointerMove}
                onPointerUp={onOverlayPointerUp}
                onPointerCancel={onOverlayPointerUp}
                onWheel={onWheel}
              />
            </div>
            <div className="loopToolbar">
              <span className="loopMeta mono">{current.width}×{current.height}{current.label ? ` · ${current.label}` : ""}{genSeconds ? ` · ${genSeconds}s` : ""}</span>
              <button className="iconBtn labeledIcon" aria-label="Save PNG" data-testid="loop-save" onClick={() => void savePng()}>{Icon.download}Save PNG</button>
              <button className="iconBtn labeledIcon" aria-label="Start over" data-testid="loop-reset" onClick={startOver}>Start over</button>
            </div>
          </div>
          <aside className="loopSide" aria-label="Regions">
            <h2>Regions</h2>
            {marks.length === 0 && <p className="loopEmpty">Pick Box or Arrow and drag on the image. Each region gets its own instruction.</p>}
            <ol className="loopRegions">
              {marks.map((m, i) => (
                <li key={m.id} className="loopRegion" data-testid={`region-${i + 1}`}>
                  <span className="regionChip" aria-hidden="true">{i + 1}</span>
                  <span className="regionKind" aria-hidden="true">{m.kind === "box" ? Icon.box : Icon.arrowUp}</span>
                  <input
                    aria-label={`Region ${i + 1} instruction`}
                    data-testid={`region-note-${i + 1}`}
                    value={m.note}
                    placeholder="What should change here?"
                    onChange={(e) => updateNote(m.id, e.target.value)}
                  />
                  <button className="iconBtn" aria-label={`Remove region ${i + 1}`} data-testid={`region-remove-${i + 1}`} onClick={() => removeMark(m.id)}>{Icon.x}</button>
                </li>
              ))}
            </ol>
          </aside>
        </section>
      )}

      {busy && !current && <RunPanel busy={busy} steps={stepsFromTimeline(timeline)} narrative={narrative} notesOpen={notesOpen} onToggleNotes={setNotesOpen} startedAt={startedAt} summarySeconds={genSeconds} />}
    </main>
  );
}
