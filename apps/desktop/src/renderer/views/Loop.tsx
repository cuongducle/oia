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
import { viewportToNatural, markerWidthFor } from "../lib/markup-annotate.js";
import { drawMark, marksPrompt, newMarkId, regionComposite, zoomAt, clampPan, layoutChips, MIN_ARROW_PX, MIN_BOX_PX, type LoopMark } from "../lib/loop-marks.js";
import { mergeVersion, capVersions } from "../lib/loop-versions.js";
import type { ChatRequest } from "@oia/services";

/**
 * SIL (docs/designs/single-image-loop.md): the single-image edit loop.
 * SL-1: generate ONE image (designer pipeline, pages=1, no outline gate),
 * flattened to a plain <img>, Save PNG. SL-2: numbered region marks (box +
 * arrow) on a view-layer overlay with pan/zoom; marks live in view state only,
 * never in a scene/store (ME-3 purity rule). SL-3: ONE codex edit per round
 * carries ALL regions (flatten composite + per-region prompt, the ME channel),
 * the result becomes the current image, undo/compare walk the version stack
 * (B7: only real jobs push entries). One session per mount like Home (C1).
 *
 * UI copy is ENGLISH by owner decision (D8).
 */

const LOOP_ASPECTS: Record<string, [number, number] | null> = {
  auto: null, "1:1": [1024, 1024], "4:5": [1024, 1280], "2:3": [1024, 1536], "9:16": [1080, 1920], "16:9": [1920, 1080],
};

const HOW_IT_WORKS = "One image at a time: describe it, generate, then mark what to change next.";
const STOP_LABEL = "Stop";
const MARK_HINT = "Drag on the image to mark a region";
const EDIT_HEAD = "Edit this image following the numbered red regions.";
const EVERY_REGION_NEEDS_A_NOTE = "Every region needs an instruction";

const Icon = {
  arrow: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  stop: <svg width="15" height="15" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" /></svg>,
  download: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>,
  pan: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>,
  box: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"><rect x="4" y="5" width="16" height="14" rx="2" strokeDasharray="3.4 2.6" /></svg>,
  arrowUp: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19 19 5" /><path d="M9 5h10v10" /></svg>,
  x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  undo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>,
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
  const [markupCapable, setMarkupCapable] = useState(false);
  const [versions, setVersions] = useState<LoopVersion[]>([]);
  /** index into versions; null = the latest (undo walks it, nothing is deleted) */
  const [cursor, setCursor] = useState<number | null>(null);
  const [compareOn, setCompareOn] = useState(false);
  const [flattenFailed, setFlattenFailed] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [genSeconds, setGenSeconds] = useState<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const activeJobRef = useRef<string | null>(null);
  /** job kind: ref for the mount-time chat-event closure, state for render */
  const jobKindRef = useRef<"generate" | "edit" | null>(null);
  const [jobKind, setJobKind] = useState<"generate" | "edit" | null>(null);
  /** base (zoom-1) centered view; double-click resets here */
  const baseRef = useRef({ tx: 0, ty: 0 });
  const offRef = useRef<(() => void) | null>(null);

  // ---- SL-2: marks + stage view transform ----
  const [tool, setTool] = useState<Tool>("pan");
  const [marks, setMarks] = useState<LoopMark[]>([]);
  /** SL-4: the selected region row (Delete removes it, highlighted on overlay) */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  /** panel row hover mirrors onto the canvas marker (amber ring) */
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  /** zoom percent for the stage cluster; mirrors viewRef.s so the label re-renders */
  const [zoomPct, setZoomPct] = useState(100);
  /** SL-4: first-use hint until the user draws their very first mark (OC-6 localStorage) */
  const [hintDone, setHintDone] = useState(() => globalThis.localStorage?.getItem("oia.loopMarkHintDone") === "1");
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
    void oia().providerStatus().then((s) => {
      setMockMode(s.image.capabilities.isMock);
      setMarkupCapable(s.image.capabilities.markupEdit === "flatten");
    }).catch(() => {});
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

  /** Canvas event → the loop's flat PNG, merged through the one-slot-per-job
   * rule (loop-versions.ts, the "Edit 3" bug's home, unit-tested there). */
  async function adoptCanvas(m: CanvasMsgMeta) {
    try {
      const flat = await flattenScenePng(m.canvas as SceneCanvas);
      setFlattenFailed("");
      const jobId = activeJobRef.current;
      setVersions((v) => capVersions(mergeVersion(v, flat, jobId, jobKindRef.current === "edit" ? "edit" : "generate")));
      setCursor(null);
      setCompareOn(false);
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
    jobKindRef.current = "generate";
    setJobKind("generate");
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
      setChatRunError(e);
    } finally {
      setBusy(false);
    }
  }

  /** SL-3: ONE edit per round carries every marked region (flatten channel). */
  async function sendEdit() {
    const cur = current;
    if (!cur || busy || !marks.length || marks.some((m) => !m.note.trim())) return;
    setBusy(true);
    setNotesOpen(true);
    markRunStart(Date.now());
    setGenSeconds(null);
    activeJobRef.current = null;
    jobKindRef.current = "edit";
    setJobKind("edit");
    setError("");
    setFlattenFailed("");
    setTimeline([]);
    setNarrative("");
    try {
      const composite = await regionComposite(cur.dataUrl, marks, cur.width, cur.height);
      const res = await oia().chatRun({
        prompt: `${EDIT_HEAD}\n${marksPrompt(marks)}`,
        ...(sessionId ? { sessionId } : {}),
        referenceImages: [composite],
        editMode: { markup: "flatten", targetName: "loop image" },
      });
      setSessionId(res.sessionId);
    } catch (e) {
      setChatRunError(e);
    } finally {
      setBusy(false);
    }
  }

  function setChatRunError(e: unknown) {
    const name = e instanceof Error ? e.name : "";
    if (name === "IpcValidationError") setError("Invalid request, please try again.");
    else if (name === "ProviderConfigError") setError("Provider configuration is invalid (mock mixed with real). See the README.");
    else setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
  }

  async function stop() {
    if (jobId) await oia().cancelChat(jobId).catch(() => {});
  }

  /** Full-resolution PNG via the native save dialog, same channel Home uses. */
  async function savePng() {
    if (!current) return;
    try {
      const blob = await (await fetch(current.dataUrl)).blob();
      await oia().saveExport("oia-loop.png", new Uint8Array(await blob.arrayBuffer()));
    } catch {
      setError("The image could not be saved. Please try again.");
    }
  }

  function startOver() {
    setVersions([]);
    setCursor(null);
    setCompareOn(false);
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

  const idx = cursor ?? Math.max(0, versions.length - 1);
  const current = versions[idx] ?? null;
  /** Before/After: compare shows the PREVIOUS version of the current slot. */
  const showBefore = compareOn && idx > 0;
  const displayed = showBefore ? versions[idx - 1] : current;
  const [autoRefinePref] = useState(() => readAutoRefinePref());
  const notesMissing = marks.some((m) => !m.note.trim());
  const editDisabled = busy || !marks.length || notesMissing;
  const editing = busy && jobKind === "edit";

  // ---- stage: fit + CENTER the image once per displayed version; switching
  // the image (new job OR undo/latest walk) invalidates its marks and view,
  // a region only belongs to the exact image it was drawn on ----
  useEffect(() => {
    setMarks([]);
    setSelectedId(null);
    setFit(null);
  }, [current]);

  useEffect(() => {
    if (!current || fit) return;
    const stage = stageRef.current;
    if (!stage) return;
    const cw = stage.clientWidth || 1;
    const ch = stage.clientHeight || 1;
    const k = Math.min(cw / current.width, ch / current.height) * 0.96;
    const w = Math.max(1, Math.round(current.width * k));
    const h = Math.max(1, Math.round(current.height * k));
    baseRef.current = { tx: Math.round((cw - w) / 2), ty: Math.round((ch - h) / 2) };
    viewRef.current = { s: 1, ...baseRef.current };
    setZoomPct(100);
    setFit({ w, h });
  }, [current, fit]);

  /** viewport (overlay css px) → natural image px, the ME mapping with an
   * identity object matrix (the <img> is never rotated). */
  function toNatural(clientX: number, clientY: number): { x: number; y: number } {
    const ov = overlayRef.current;
    const cur = current;
    if (!ov || !cur || !fit) return { x: 0, y: 0 };
    const r = ov.getBoundingClientRect();
    const { s, tx, ty } = viewRef.current;
    return viewportToNatural({ x: clientX - r.left, y: clientY - r.top }, [s, 0, 0, s, tx, ty], [1, 0, 0, 1, 0, 0], fit.w, fit.h, cur.width, cur.height);
  }

  /** rAF overlay: image pixel-truth partner of the ME overlay (C3 lesson:
   * the canvas carries CSS size 100%, attrs follow dpr × rect). Idle-saving:
   * the loop keeps ticking but only REPAINTS when something actually changed
   * (state deps restart the effect; ref mutations below mark dirty). While
   * comparing, the stage shows a plain picture, no marks, no pointers. */
  const dirtyRef = useRef(true);
  function markDirty(): void {
    dirtyRef.current = true;
  }
  useEffect(() => {
    if (!current || !fit) return;
    markDirty();
    const draw = () => {
      rafRef.current = requestAnimationFrame(draw);
      if (!dirtyRef.current) return; // idle: keep the loop, skip the paint
      dirtyRef.current = false;
      const ov = overlayRef.current;
      const world = worldRef.current;
      const cur = current;
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
      if (compareOn) return; // plain before/after view
      const { s, tx, ty } = viewRef.current;
      if (world) world.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
      const k = fit.w / cur.width;
      ctx.translate(tx, ty);
      ctx.scale(s, s);
      ctx.scale(k, k);
      const chips = layoutChips(marks, cur.width, cur.height);
      marks.forEach((m, i) => {
        drawMark(ctx, m, i, cur.width, cur.height, chips[i], "canvas");
        const highlight = m.id === selectedId ? "#ffffff" : m.id === hoveredId ? "#f59e0b" : null;
        if (highlight) {
          // selection ring (white) / hover ring (amber): dashed over the mark
          ctx.save();
          ctx.strokeStyle = highlight;
          ctx.lineWidth = markerWidthFor(cur.width, cur.height) * 0.5;
          ctx.setLineDash([markerWidthFor(cur.width, cur.height), markerWidthFor(cur.width, cur.height) * 0.8]);
          if (m.kind === "box") ctx.strokeRect(m.x, m.y, m.w, m.h);
          else {
            ctx.beginPath();
            ctx.moveTo(m.from.x, m.from.y);
            ctx.lineTo(m.to.x, m.to.y);
            ctx.stroke();
          }
          ctx.restore();
        }
      });
      const d = draftRef.current;
      if (d) {
        const draftMark: LoopMark =
          d.kind === "box"
            ? { id: "draft", kind: "box", note: "", x: Math.min(d.from.x, d.to.x), y: Math.min(d.from.y, d.to.y), w: Math.abs(d.to.x - d.from.x), h: Math.abs(d.to.y - d.from.y) }
            : { id: "draft", kind: "arrow", note: "", from: d.from, to: d.to };
        drawMark(ctx, draftMark, marks.length, cur.width, cur.height, undefined, "canvas");
      }
    };
    rafRef.current = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafRef.current);
  }, [current, fit, marks, compareOn, selectedId, hoveredId]);

  function onOverlayPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!current || !fit || compareOn) return;
    // synthetic/untracked pointers cannot capture (same lesson as the ME overlay)
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* the draft already started */ }
    if (tool === "pan") {
      panRef.current = { x: e.clientX, y: e.clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
      return;
    }
    draftRef.current = { kind: tool, from: toNatural(e.clientX, e.clientY), to: toNatural(e.clientX, e.clientY) };
    markDirty();
  }

  /** wheel is a NATIVE non-passive listener: React's JSX onWheel is passive,
   * preventDefault there is a silent no-op (teardown P0-5). */
  useEffect(() => {
    const ov = overlayRef.current;
    if (!ov || !current || compareOn) return;
    const onWheelNative = (e: WheelEvent) => {
      e.preventDefault();
      const r = ov.getBoundingClientRect();
      const v = zoomAt(viewRef.current, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
      viewRef.current = v;
      markDirty();
      setZoomPct(Math.round(v.s * 100));
    };
    ov.addEventListener("wheel", onWheelNative, { passive: false });
    return () => ov.removeEventListener("wheel", onWheelNative);
  }, [current, compareOn]);

  // elapsed seconds tick while a job runs (the run bar under the tools)
  const [, setRunTick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setRunTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const elapsedS = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null;

  function onOverlayPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    const pan = panRef.current;
    if (pan) {
      const stage = stageRef.current;
      const next = { s: viewRef.current.s, tx: pan.tx + (e.clientX - pan.x), ty: pan.ty + (e.clientY - pan.y) };
      viewRef.current = stage && fit ? clampPan(next, stage.clientWidth, stage.clientHeight, fit.w, fit.h) : next;
      markDirty();
      return;
    }
    const d = draftRef.current;
    if (d) {
      d.to = toNatural(e.clientX, e.clientY);
      markDirty();
    }
  }

  function onOverlayDoubleClick() {
    if (compareOn) return;
    viewRef.current = { s: 1, ...baseRef.current };
    markDirty();
    setZoomPct(100);
  }

  /** zoom cluster helpers: zoom keeps the STAGE CENTER pinned (cursor pinning
   * stays on the wheel); % resets, Fit returns to the centered base view. */
  function stageZoom(factor: number) {
    const stage = stageRef.current;
    const cx = stage ? stage.clientWidth / 2 : 0;
    const cy = stage ? stage.clientHeight / 2 : 0;
    const v = zoomAt(viewRef.current, cx, cy, factor);
    viewRef.current = v;
    markDirty();
    setZoomPct(Math.round(v.s * 100));
  }
  function fitView() {
    viewRef.current = { s: 1, ...baseRef.current };
    markDirty();
    setZoomPct(100);
  }

  function onOverlayPointerUp() {
    const pan = panRef.current;
    if (pan) {
      panRef.current = null;
      return;
    }
    const d = draftRef.current;
    draftRef.current = null;
    if (!d || !current) return;
    const W = current.width;
    const H = current.height;
    if (d.kind === "box") {
      // clamp the committed box INTO the image: the overlay spans the whole
      // stage, a drag started on the gray apron must not pin a region outside
      // the artwork (the model reads image-space coordinates)
      const x0 = Math.max(0, Math.min(d.from.x, d.to.x));
      const y0 = Math.max(0, Math.min(d.from.y, d.to.y));
      const x1 = Math.min(W, Math.max(d.from.x, d.to.x));
      const y1 = Math.min(H, Math.max(d.from.y, d.to.y));
      const w = x1 - x0;
      const h = y1 - y0;
      // BOTH sides must clear the minimum, a 1000×1 sliver is not a region
      if (w >= MIN_BOX_PX && h >= MIN_BOX_PX) {
        pushMark({ id: newMarkId(), kind: "box", note: "", x: x0, y: y0, w, h });
      }
      return;
    }
    const pin = (p: { x: number; y: number }) => ({ x: Math.max(0, Math.min(W, p.x)), y: Math.max(0, Math.min(H, p.y)) });
    if (Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) >= MIN_ARROW_PX) {
      pushMark({ id: newMarkId(), kind: "arrow", note: "", from: pin(d.from), to: pin(d.to) });
    }
  }

  function onWheel(e: React.WheelEvent<HTMLCanvasElement>) {
    if (!current || compareOn) return;
    e.preventDefault();
    const ov = overlayRef.current;
    if (!ov) return;
    const r = ov.getBoundingClientRect();
    viewRef.current = zoomAt(viewRef.current, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
  }

  // Esc kills the in-progress draft; 1/2/3 pick the tool, Delete removes the
  // selected region (SL-4). Typing in a field never reaches here.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && draftRef.current) {
        draftRef.current = null;
        return;
      }
      const t = e.target;
      if (t instanceof HTMLInputElement || t instanceof HTMLTextAreaElement || t instanceof HTMLSelectElement) return;
      if (e.key === "1") {
        setTool("pan");
        setSelectedId(null);
        setCompareOn(false);
      } else if (e.key === "2") {
        setTool("box");
        setCompareOn(false);
      } else if (e.key === "3") {
        setTool("arrow");
        setCompareOn(false);
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        setMarks((m) => m.filter((k) => k.id !== selectedId));
        setSelectedId(null);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId]);

  function pushMark(m: LoopMark) {
    setMarks((prev) => [...prev, m]);
    setSelectedId(m.id);
    if (!hintDone) {
      globalThis.localStorage?.setItem("oia.loopMarkHintDone", "1");
      setHintDone(true);
    }
  }

  function updateNote(id: string, note: string) {
    setMarks((m) => m.map((k) => (k.id === id ? ({ ...k, note } as LoopMark) : k)));
  }
  function removeMark(id: string) {
    setMarks((m) => m.filter((k) => k.id !== id));
    if (selectedId === id) setSelectedId(null);
  }

  return (
    <main className="studioPage loopView loopCanvasFirst" aria-label="Edit loop">
      {!current && !displayed && (
        <section className="loopStage loopEmptyStage" data-testid="loop-empty" aria-label="Canvas">
          {busy ? (
            <div className="loopEmptyRun">
              <RunPanel busy={busy} steps={stepsFromTimeline(timeline)} narrative={narrative} notesOpen={notesOpen} onToggleNotes={setNotesOpen} startedAt={startedAt} summarySeconds={genSeconds} />
            </div>
          ) : (
            <div className="loopEmptyInner">
              <span className="loopEmptyGlyph" aria-hidden="true">
                <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"><rect x="4" y="5" width="16" height="14" rx="2.5" /><circle cx="9.2" cy="10" r="1.6" /><path d="m5 17 4.2-4.2a1.6 1.6 0 0 1 2.3 0L16 17" /></svg>
              </span>
              <h1>Describe the image below, then Generate</h1>
              <p>{HOW_IT_WORKS}</p>
            </div>
          )}
        </section>
      )}

      {(error || flattenFailed) && (
        <div className="notice error" role="alert">{error || flattenFailed}</div>
      )}

      {current && displayed && (
        <section className="loopWork" aria-label="Mark and edit">
          <div className="loopStageCol">
            <div className="loopTools" role="toolbar" aria-label="Marking tools">
              <button className={`loopTool ${tool === "pan" && !compareOn ? "active" : ""}`} data-testid="tool-pan" aria-pressed={tool === "pan"} title="Pan and zoom (1)" onClick={() => { setTool("pan"); setCompareOn(false); }}>{Icon.pan}<span>Pan</span><kbd>1</kbd></button>
              <button className={`loopTool ${tool === "box" && !compareOn ? "active" : ""}`} data-testid="tool-box" aria-pressed={tool === "box"} title="Draw a box around a region (2)" onClick={() => { setTool("box"); setCompareOn(false); }}>{Icon.box}<span>Box</span><kbd>2</kbd></button>
              <button className={`loopTool ${tool === "arrow" && !compareOn ? "active" : ""}`} data-testid="tool-arrow" aria-pressed={tool === "arrow"} title="Point at a spot with an arrow (3)" onClick={() => { setTool("arrow"); setCompareOn(false); }}>{Icon.arrowUp}<span>Arrow</span><kbd>3</kbd></button>
              {tool !== "pan" && !compareOn && <span className="loopHint">{MARK_HINT}</span>}
              {busy && current && (
                <span className="loopRunBar" data-testid="loop-runbar" role="status">
                  <span className="spin" aria-hidden="true">◌</span>
                  <span>{jobKind === "edit" ? "Editing" : "Generating"}…</span>
                  {elapsedS !== null && <span className="mono">{elapsedS}s</span>}
                  {stepsFromTimeline(timeline).map((s, i) => (
                    <span key={i} className={`loopStep ${s.state}`}>{s.state === "done" ? "✓" : "·"} {s.label}</span>
                  ))}
                </span>
              )}
              <span className="composerSpacer" />
              <button className="loopTool" data-testid="loop-compare" aria-pressed={compareOn} disabled={idx < 1} title="Toggle the previous version" onClick={() => setCompareOn((v) => !v)}>{Icon.undo}<span>{compareOn ? "After" : "Before"}</span></button>
            </div>
            <div className="loopStage" ref={stageRef} data-testid="loop-stage">
              {showBefore && <span className="stageBadge" data-testid="loop-before-badge">Before</span>}
              {!hintDone && marks.length === 0 && !compareOn && !busy && (
                <p className="loopFirstHint" data-testid="loop-first-hint">Circle the part you want changed, one box per fix.</p>
              )}
              {fit && displayed && (
                <div className="loopWorld" ref={worldRef}>
                  <img data-testid="loop-image" src={displayed.dataUrl} alt={showBefore ? "The previous loop image" : "The current loop image"} width={fit.w} height={fit.h} draggable={false} />
                </div>
              )}
              {busy && current && (
                <div className="loopProgressVeil" data-testid="loop-progress">
                  <span className="spin big" aria-hidden="true">◌</span>
                  <span>{jobKind === "edit" ? "Editing" : "Generating"}…{elapsedS !== null ? ` ${elapsedS}s` : ""}</span>
                </div>
              )}
              <div className="loopZoom" role="group" aria-label="Zoom">
                <button aria-label="Zoom out" title="Zoom out" onClick={() => stageZoom(1 / 1.25)}>−</button>
                <button className="loopZoomPct" data-testid="loop-zoom" title="Reset view (or double-click the image)" onClick={fitView}>{zoomPct}%</button>
                <button aria-label="Zoom in" title="Zoom in" onClick={() => stageZoom(1.25)}>+</button>
                <button title="Fit to screen" onClick={fitView}>Fit</button>
              </div>
              <canvas
                ref={overlayRef}
                className="loopOverlay"
                data-testid="loop-overlay"
                style={{ cursor: compareOn ? "default" : tool === "pan" ? "grab" : "crosshair", pointerEvents: compareOn ? "none" : "auto" }}
                onPointerDown={onOverlayPointerDown}
                onPointerMove={onOverlayPointerMove}
                onPointerUp={onOverlayPointerUp}
                onPointerCancel={onOverlayPointerUp}
              />
            </div>
            <div className="loopToolbar">
              <span className="loopMeta mono">{current.width} × {current.height} · Version {idx + 1} of {versions.length} · {current.label}{genSeconds ? ` · ${genSeconds}s` : ""}</span>
              <button className="iconBtn labeledIcon" aria-label="Save PNG" data-testid="loop-save" onClick={() => void savePng()}>{Icon.download}Save PNG</button>
              <button className="iconBtn labeledIcon" aria-label="Start over" data-testid="loop-reset" onClick={startOver}>Start over</button>
            </div>
            {versions.length > 1 && (
              <div className="loopFilmstrip" role="listbox" aria-label="Versions">
                {versions.map((ver, i) => (
                  <button
                    key={`${i}-${ver.jobId ?? "none"}`}
                    data-testid={`loop-version-${i + 1}`}
                    className={`loopThumb ${i === idx ? "active" : ""}`}
                    role="option"
                    aria-selected={i === idx}
                    title={`${ver.label} (version ${i + 1} of ${versions.length})`}
                    onClick={() => { setCursor(i); setCompareOn(false); }}
                  >
                    <img src={ver.dataUrl} alt={`${ver.label}, version ${i + 1}`} draggable={false} />
                  </button>
                ))}
              </div>
            )}
          </div>
          <aside className="loopSide" aria-label="Regions">
            <h2>Regions{marks.length > 0 ? ` · ${marks.filter((m) => m.note.trim()).length}/${marks.length} described` : ""}</h2>
            {marks.length > 0 && (
              <div className="loopProgressTrack" role="progressbar" aria-label="Regions described" aria-valuenow={marks.filter((m) => m.note.trim()).length} aria-valuemin={0} aria-valuemax={marks.length}>
                <span style={{ width: `${(marks.filter((m) => m.note.trim()).length / marks.length) * 100}%` }} />
              </div>
            )}
            {marks.length === 0 && <p className="loopEmpty">Pick Box or Arrow and drag on the image. Each region gets its own instruction.</p>}
            {marks.length > 0 && <p className="loopEmpty loopKeyHint">Click a region to select it, Delete removes it. Keys 1, 2, 3 switch tools.</p>}
            <ol className="loopRegions">
              {marks.map((m, i) => (
                <li key={m.id} className={`loopRegion ${m.id === selectedId ? "selected" : ""}`} data-testid={`region-${i + 1}`} onClick={() => setSelectedId((cur) => (cur === m.id ? null : m.id))} onMouseEnter={() => setHoveredId(m.id)} onMouseLeave={() => setHoveredId(null)}>
                  <span className="regionChip" aria-hidden="true">{i + 1}</span>
                  <span className="regionKind" aria-hidden="true">{m.kind === "box" ? Icon.box : Icon.arrowUp}</span>
                  <input
                    aria-label={`Region ${i + 1} instruction`}
                    data-testid={`region-note-${i + 1}`}
                    className={!m.note.trim() && marks.length && notesMissing ? "invalid" : ""}
                    value={m.note}
                    placeholder="What should change here?"
                    onFocus={() => setSelectedId(m.id)}
                    onChange={(e) => updateNote(m.id, e.target.value)}
                  />
                  <button className="iconBtn" aria-label={`Remove region ${i + 1}`} data-testid={`region-remove-${i + 1}`} onClick={() => removeMark(m.id)}>{Icon.x}</button>
                </li>
              ))}
            </ol>
            {markupCapable ? (
              editing ? (
                <button className="generateBtn labeled stop loopEditBtn" aria-label={STOP_LABEL} onClick={() => void stop()}>{Icon.stop}Stop</button>
              ) : (
                <button
                  className="generateBtn labeled loopEditBtn"
                  aria-label="Edit marked regions"
                  data-testid="loop-edit"
                  disabled={editDisabled}
                  title={marks.length === 0 ? "Mark a region first" : notesMissing ? EVERY_REGION_NEEDS_A_NOTE : "Send every region in one edit"}
                  onClick={() => void sendEdit()}
                >
                  Edit regions
                  <CostHint testId="loop-edit-cost" text={costHintText({ images: 1, isMock: mockMode })} />
                </button>
              )
            ) : (
              <p className="loopEmpty">Region edits need a provider that supports markup edits.</p>
            )}
            {!editing && marks.length > 0 && notesMissing && (
              <p className="loopEmpty loopDisabledWhy">Describe every region to enable the edit.</p>
            )}
          </aside>
        </section>
      )}

      <section className="promptCard loopBar" aria-label="Generate one image">
        <textarea
          aria-label="Image idea"
          data-testid="loop-idea"
          value={prompt}
          placeholder={current ? "Describe the next image…" : "What would you like to generate?"}
          rows={current ? 1 : 2}
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
          {!busy && !current && (
            <CostHint
              testId="loop-cost"
              text={costHintText({ images: 1, isMock: mockMode, autoRefineRounds: autoRefinePref ? AUTO_REFINE_MAX_ROUNDS_DEFAULT : 0 })}
            />
          )}
          {busy ? (
            <button className="generateBtn labeled stop" aria-label={STOP_LABEL} title={STOP_LABEL} onClick={() => void stop()}>{Icon.stop}Stop</button>
          ) : (
            <button className="generateBtn labeled" aria-label="Generate image" data-testid="loop-generate" disabled={!prompt.trim()} onClick={() => void submit()}>Generate{Icon.arrow}</button>
          )}
        </div>
      </section>
    </main>
  );
}
