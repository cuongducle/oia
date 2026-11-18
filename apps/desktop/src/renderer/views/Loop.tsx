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
import { marksPrompt, newMarkId, regionComposite, zoomAt, clampPan, simplifyPath, pathLength, MIN_ARROW_PX, MIN_BOX_PX, type LoopMark } from "../lib/loop-marks.js";
import { markToObject, objectToMark, pathStrokePoints, markStrokeWidth, MARK_UI } from "../lib/loop-fabric.js";
import { importPlan, importableFile, IMPORT_MAX_EDGE } from "../lib/loop-import.js";
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

const SUGGESTIONS = [
  "Phone case banner on a mint background, minimal studio light",
  "Milk tea poster with Vietnamese headline text, warm tones",
  "Cosmetics flat lay, soft daylight, clean shadows",
];
const STOP_LABEL = "Stop";
const MARK_HINT = "Drag on the image to mark a region";
const EDIT_HEAD = "Edit this image following the red annotations.";
const EVERY_REGION_NEEDS_A_NOTE = "Every region needs an instruction";

const Icon = {
  arrow: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  stop: <svg width="15" height="15" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" /></svg>,
  download: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>,
  pan: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>,
  box: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinejoin="round"><rect x="4" y="5" width="16" height="14" rx="2" strokeDasharray="3.4 2.6" /></svg>,
  oval: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4"><ellipse cx="12" cy="12" rx="8" ry="7" strokeDasharray="3.4 2.6" /></svg>,
  pen: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 19l7-7 3 3-7 7-3-3z" /><path d="M18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5z" /><path d="M2 2l7.586 7.586" /><circle cx="11" cy="11" r="2" /></svg>,
  highlight: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 18l9-9 4 4-9 9H5v-4z" /><path d="M13 5l2-2 6 6-2 2" /></svg>,
  textType: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 7V5h16v2" /><path d="M9 5v14" /><path d="M7 19h4" /><path d="M14 12h6" /><path d="M17 12v7" /><path d="M15 19h4" /></svg>,
  upload: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M17 8l-5-5-5 5" /><path d="M12 3v12" /></svg>,
  paperclip: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>,
  sparkle: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" /><path d="M19 15l.9 2.1L22 18l-2.1.9L19 21l-.9-2.1L16 18l2.1-.9L19 15z" /></svg>,
  grid: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1.5" /><rect x="14" y="3" width="7" height="7" rx="1.5" /><rect x="3" y="14" width="7" height="7" rx="1.5" /><rect x="14" y="14" width="7" height="7" rx="1.5" /></svg>,
  send: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="m13 6 6 6-6 6" /></svg>,
  gallery: <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><circle cx="8.6" cy="10" r="1.5" /><path d="m5 17 4-4a1.8 1.8 0 0 1 2.5 0L16 17" /><path d="m14 15 2.2-2.2a1.8 1.8 0 0 1 2.5 0L21 15" /></svg>,
  arrowUp: <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 19 19 5" /><path d="M9 5h10v10" /></svg>,
  x: <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round"><path d="M18 6 6 18M6 6l12 12" /></svg>,
  undo: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 14 4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>,
};

type Tool = "pan" | "box" | "arrow" | "oval" | "path" | "highlight" | "text";

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
  const [globalNote, setGlobalNote] = useState("");
  const [aspect, setAspect] = useState("auto");
  const [stylePreset, setStylePreset] = useState(() => readStylePref());
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [narrative, setNarrative] = useState("");
  const [error, setError] = useState("");
  const [importedNote, setImportedNote] = useState("");
  /** ChatGPT-style: an attached photo waiting in the bar, becomes the base on send. */
  const [attach, setAttach] = useState<{ dataUrl: string; width: number; height: number } | null>(null);
  /** The two intents behind ONE image (attached, or already on canvas): fix
   * it, or build a new image around it (the product as the reference). Not
   * everyone starts with a photo: generate the product from words first,
   * then flip the intent to dress the scene around it. */
  const [attachMode, setAttachMode] = useState<"edit" | "new">("edit");
  const attachInputRef = useRef<HTMLInputElement>(null);
  const [assetsOpen, setAssetsOpen] = useState(false);
  const [assets, setAssets] = useState<{ key: string; mtimeMs: number }[]>([]);
  const importInputRef = useRef<HTMLInputElement>(null);
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
  const marksRef = useRef<LoopMark[]>(marks);
  marksRef.current = marks;
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
  const draftRef = useRef<
    | { kind: "box" | "arrow" | "oval"; from: { x: number; y: number }; to: { x: number; y: number } }
    | { kind: "path" | "highlight"; pts: { x: number; y: number }[] }
    | null
  >(null);
  const panRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const worldRef = useRef<HTMLDivElement | null>(null);
  const fabricRef = useRef<import("fabric").Canvas | null>(null);
  const fabricNSRef = useRef<typeof import("fabric") | null>(null);
  const fabricDraftRef = useRef<import("fabric").Object | null>(null);
  const drawRef = useRef<{ kind: "box" | "oval" | "arrow"; from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const syncingRef = useRef(false);
  const [syncTick, setSyncTick] = useState(0);
  const toolRef = useRef(tool);
  toolRef.current = tool;
  const compareOnRef = useRef(compareOn);
  compareOnRef.current = compareOn;

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
    // restore the last loop session (versions + prompt + marks); the schema
    // gate keeps a corrupt/stale file from injecting junk into the view
    void oia()
      .loopSessionLoad()
      .then((s) => {
        if (!s || s.versions.length === 0) return;
        const cursor = s.cursor !== null && s.cursor < s.versions.length ? s.cursor : null;
        carryMarksRef.current = true; // the [current] effect must not wipe restored marks
        setVersions(s.versions);
        setCursor(cursor);
        setPrompt(s.prompt);
        setGlobalNote(s.globalNote ?? "");
        setMarks(s.marks);
      })
      .catch(() => {});
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
      const wasEdit = jobKindRef.current === "edit";
      setVersions((v) => capVersions(mergeVersion(v, flat, jobId, wasEdit ? "edit" : "generate")));
      if (wasEdit) carryMarksRef.current = true; // regions carry into the fresh image
      setCursor(null);
      setCompareOn(false);
      setNotesOpen(false);
      if (startedAtRef.current) setGenSeconds(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
    } catch (e) {
      setFlattenFailed(`The result could not be prepared for the loop: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function submit() {
    if (busy) return;
    // attached photo becomes the base; text (if any) immediately edits it
    if (attach) {
      const base = attach;
      const mode = attachMode;
      setAttach(null);
      setAttachMode("edit");
      pushImported(base);
      if (!prompt.trim()) return; // just the base, no quota spent
      if (mode === "new") {
        await runEditRound(
          base,
          [],
          `Using the attached photo as the product reference, create a NEW image: ${prompt.trim()}. Keep the product itself exactly the same shape, colors and details; freely change everything else around it.`,
        );
      } else {
        await runEditRound(base, marks, prompt.trim());
      }
      setPrompt("");
      return;
    }
    // an image is on stage: the bar is a chat turn, not a new generate
    if (current) {
      if (!prompt.trim() && !marks.length) return;
      if (attachMode === "new" && prompt.trim()) {
        const base = current;
        setAttachMode("edit");
        await runEditRound(
          base,
          [],
          `Using the attached photo as the product reference, create a NEW image: ${prompt.trim()}. Keep the product itself exactly the same shape, colors and details; freely change everything else around it.`,
        );
      } else {
        await runEditRound(current, marks, prompt.trim() || globalNote);
      }
      setPrompt("");
      return;
    }
    if (!prompt.trim()) return;
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
  /** The panel button keeps its own gate (marks + notes/global); the bar
   * chat turn calls runEditRound directly. One path, metered once. */
  async function sendEdit() {
    if (!current || busy || !marks.length) return;
    if (marks.some((m) => m.kind !== "text" && !m.note.trim()) && !globalNote.trim()) return;
    await runEditRound(current, marks, globalNote);
  }

  async function runEditRound(base: { dataUrl: string; width: number; height: number }, roundMarks: LoopMark[], globalNote: string): Promise<void> {
    if (busy) return;
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
      const composite = await regionComposite(base.dataUrl, roundMarks, base.width, base.height);
      const res = await oia().chatRun({
        prompt: `${EDIT_HEAD}\n${marksPrompt(roundMarks, globalNote)}`,
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

  /** Decode a dropped/attached image, cap the long edge at IMPORT_MAX_EDGE
   * (quota honesty: the edit round sends the image, oversized pixels waste
   * it). Returns the dataUrl the loop can use as a base. */
  async function readImageFile(file: File): Promise<{ dataUrl: string; width: number; height: number; scaled: boolean }> {
    if (busy) throw new Error("busy");
    if (!importableFile(file)) throw new Error("type");
    const dataUrl = await new Promise<string>((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => rej(fr.error ?? new Error("read failed"));
      fr.readAsDataURL(file);
    });
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const el = new Image();
      el.onload = () => res(el);
      el.onerror = () => rej(new Error("decode failed"));
      el.src = dataUrl;
    });
    const plan = importPlan(img.naturalWidth, img.naturalHeight);
    if (plan.keep) return { dataUrl, width: img.naturalWidth, height: img.naturalHeight, scaled: false };
    const c = document.createElement("canvas");
    c.width = plan.width;
    c.height = plan.height;
    c.getContext("2d")!.drawImage(img, 0, 0, plan.width, plan.height);
    return { dataUrl: c.toDataURL("image/png"), width: plan.width, height: plan.height, scaled: true };
  }

  function pushImported(base: { dataUrl: string; width: number; height: number }): void {
    setVersions((v) => capVersions(mergeVersion(v, base, null, "import")));
    setCursor(null);
    setCompareOn(false);
    setMarks([]);
    setError("");
  }

  /** Drag-drop lands straight on the canvas: it becomes the base at once. */
  async function importImageFile(file: File): Promise<void> {
    try {
      const r = await readImageFile(file);
      pushImported(r);
      setImportedNote(r.scaled ? `Imported at ${r.width} × ${r.height} (capped at ${IMPORT_MAX_EDGE}px long edge).` : "");
    } catch {
      setError("That image could not be imported. Please try another file.");
    }
  }

  /** The Assets popover lists the app's stored uploads over the privileged
   * oia:// scheme (no bytes through the renderer until one is picked). */
  async function openAssets(): Promise<void> {
    setAssetsOpen((v) => !v);
    if (!assets.length) {
      try {
        const all = await oia().filesList();
        setAssets(all.filter((a) => /\.(png|jpe?g|webp)$/i.test(a.key)).sort((a, b) => b.mtimeMs - a.mtimeMs).slice(0, 24));
      } catch {
        setError("Your saved images could not be listed. Please try again.");
      }
    }
  }

  /** Pick one stored upload into the attach slot (fetch bytes → dataUrl). */
  async function pickAsset(key: string): Promise<void> {
    setAssetsOpen(false);
    try {
      const blob = await (await fetch(`oia://files/${key}`)).blob();
      const dataUrl = await new Promise<string>((res, rej) => {
        const fr = new FileReader();
        fr.onload = () => res(String(fr.result));
        fr.onerror = () => rej(fr.error ?? new Error("read failed"));
        fr.readAsDataURL(blob);
      });
      const img = await new Promise<HTMLImageElement>((res, rej) => {
        const el = new Image();
        el.onload = () => res(el);
        el.onerror = () => rej(new Error("decode failed"));
        el.src = dataUrl;
      });
      const plan = importPlan(img.naturalWidth, img.naturalHeight);
      setAttach({ dataUrl, width: plan.keep ? img.naturalWidth : plan.width, height: plan.keep ? img.naturalHeight : plan.height });
    } catch {
      setError("That image could not be attached. Please try another.");
    }
  }

  /** The bar's attach slot: hold the photo in the composer until send. */
  async function pickAttach(file: File): Promise<void> {
    try {
      const r = await readImageFile(file);
      setAttach({ dataUrl: r.dataUrl, width: r.width, height: r.height });
      setError("");
    } catch {
      setError("Only PNG, JPEG or WebP images can be attached.");
    }
  }

  /** Dropping a photo onto the quiet empty view parks it in the composer
   * (same gesture as the paperclip); it becomes the base on send. */
  function onAttachDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) void pickAttach(f);
  }

  function onImportDrop(e: React.DragEvent) {
    e.preventDefault();
    const f = e.dataTransfer?.files?.[0];
    if (f) void importImageFile(f);
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

  /** Debounced session save: every versions/cursor/prompt/marks change lands
   * on disk ~800ms later (atomic write utility-side). Start over saves an
   * empty session, which the utility treats as "delete the file". */
  const sessionLoadedRef = useRef(false);
  const sessionTimerRef = useRef<number | null>(null);
  useEffect(() => {
    if (!sessionLoadedRef.current) {
      // first paint of a restored session is the loaded state, not a change
      if (versions.length > 0 || prompt.trim() !== "") sessionLoadedRef.current = true;
      if (!sessionLoadedRef.current) return;
    }
    if (sessionTimerRef.current !== null) window.clearTimeout(sessionTimerRef.current);
    sessionTimerRef.current = window.setTimeout(() => {
      void oia().loopSessionSave({ versions, cursor, prompt, globalNote, marks }).catch(() => {});
    }, 800);
    return () => {
      if (sessionTimerRef.current !== null) window.clearTimeout(sessionTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [versions, cursor, prompt, globalNote, marks]);

  function startOver() {
    setVersions([]);
    setCursor(null);
    setCompareOn(false);
    setMarks([]);
    setFit(null);
    setPrompt("");
    setGlobalNote("");
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
  const notesMissing = marks.some((m) => m.kind !== "text" && !m.note.trim()) && !globalNote.trim();
  const editDisabled = busy || !marks.length || notesMissing;
  const editing = busy && jobKind === "edit";

  // ---- stage: fit + CENTER the image once per displayed version; switching
  // the image (new job OR undo/latest walk) invalidates its marks and view,
  // a region only belongs to the exact image it was drawn on. EXCEPT right
  // after a finished edit round: marks carry over (position + note) so the
  // next round refines them instead of re-drawing them (owner pick 18/11) ----
  const carryMarksRef = useRef(false);
  useEffect(() => {
    if (carryMarksRef.current) {
      carryMarksRef.current = false;
      return;
    }
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

  // ---- Fabric marking layer (owner directive 18/11: use the library we
  // already ship instead of hand-rolling). Interaction (drag, handles,
  // selection, freehand brush) belongs to fabric; LoopMark[] stays the single
  // source of truth: the prompt, the red composite and the session file read
  // marks, never fabric objects. While comparing, the stage shows a plain
  // picture: no marks, no interaction.
  function applyViewToFabric(): void {
    const fc = fabricRef.current;
    const cur = current;
    if (!fc || !cur || !fit) return;
    const { s, tx, ty } = viewRef.current;
    const world = worldRef.current;
    if (world) world.style.transform = `translate(${tx}px, ${ty}px) scale(${s})`;
    const z = s * (fit.w / cur.width);
    fc.setViewportTransform([z, 0, 0, z, tx, ty]);
    fc.requestRenderAll();
  }

  function scenePt(fc: import("fabric").Canvas, opt: { e: Event; scenePoint?: { x: number; y: number } }): { x: number; y: number } {
    if (opt.scenePoint) return opt.scenePoint;
    const ev = opt.e as PointerEvent;
    const r = fc.getElement().getBoundingClientRect();
    const z = fc.getZoom() || 1;
    const vpt = fc.viewportTransform ?? [1, 0, 0, 1, 0, 0];
    return { x: ((ev.clientX - r.left) - vpt[4]) / z, y: ((ev.clientY - r.top) - vpt[5]) / z };
  }

  /** Draft preview for box/oval/arrow drags (the library has no shape-draw
   * tool; the brush only covers freehand). One live fabric object. */
  function updateDraft(fabric: typeof import("fabric"), d: { kind: "box" | "oval" | "arrow"; from: { x: number; y: number }; to: { x: number; y: number } }): void {
    const fc = fabricRef.current;
    if (!fc || !current) return;
    const sw = markStrokeWidth(current.width, current.height);
    const x = Math.min(d.from.x, d.to.x);
    const y = Math.min(d.from.y, d.to.y);
    const w = Math.abs(d.to.x - d.from.x);
    const h = Math.abs(d.to.y - d.from.y);
    if (!fabricDraftRef.current) {
      const style = { stroke: MARK_UI.stroke, strokeWidth: sw, fill: "rgba(255,0,0,0.08)", strokeUniform: true, strokeDashArray: [sw * 2, sw * 1.4], selectable: false, evented: false, objectCaching: false };
      fabricDraftRef.current = d.kind === "oval"
        ? new fabric.Ellipse({ left: x, top: y, rx: w / 2, ry: h / 2, ...style })
        : d.kind === "box"
          ? new fabric.Rect({ left: x, top: y, width: w, height: h, ...style })
          : new fabric.Line([d.from.x, d.from.y, d.to.x, d.to.y], { stroke: MARK_UI.stroke, strokeWidth: sw * 2.2, strokeLineCap: "round", selectable: false, evented: false });
      fc.add(fabricDraftRef.current);
    } else {
      const o = fabricDraftRef.current;
      if (d.kind === "oval" && "rx" in o) { o.set({ left: x, top: y, rx: w / 2, ry: h / 2 }); }
      else if (d.kind === "box" && "width" in o) { o.set({ left: x, top: y, width: w, height: h }); }
      else if (d.kind === "arrow") { (o as import("fabric").Line).set({ x1: d.from.x, y1: d.from.y, x2: d.to.x, y2: d.to.y }); }
      o.setCoords();
    }
    fc.requestRenderAll();
  }

  /** Commit a dragged draft with the same clamps the hand-rolled layer had:
   * shapes land inside the image, minimum sizes apply. */
  function commitDraft(d: { kind: "box" | "oval" | "arrow"; from: { x: number; y: number }; to: { x: number; y: number } }): void {
    if (!current) return;
    const W = current.width;
    const H = current.height;
    if (d.kind === "arrow") {
      const pin = (p: { x: number; y: number }) => ({ x: Math.max(0, Math.min(W, p.x)), y: Math.max(0, Math.min(H, p.y)) });
      if (Math.hypot(d.to.x - d.from.x, d.to.y - d.from.y) >= MIN_ARROW_PX) {
        pushMark({ id: newMarkId(), kind: "arrow", note: "", from: pin(d.from), to: pin(d.to) });
      }
      return;
    }
    const x0 = Math.max(0, Math.min(d.from.x, d.to.x));
    const y0 = Math.max(0, Math.min(d.from.y, d.to.y));
    const x1 = Math.min(W, Math.max(d.from.x, d.to.x));
    const y1 = Math.min(H, Math.max(d.from.y, d.to.y));
    const w = x1 - x0;
    const h = y1 - y0;
    if (w >= MIN_BOX_PX && h >= MIN_BOX_PX) {
      pushMark(
        d.kind === "box"
          ? { id: newMarkId(), kind: "box", note: "", x: x0, y: y0, w, h }
          : { id: newMarkId(), kind: "oval", note: "", cx: x0 + w / 2, cy: y0 + h / 2, rx: w / 2, ry: h / 2 },
      );
    }
  }

  // one fabric canvas per displayed image (tool/compare refs beat stale closures)
  useEffect(() => {
    if (!current || !fit) return;
    const el = overlayRef.current;
    const stage = stageRef.current;
    if (!el || !stage) return;
    let dead = false;
    void (async () => {
      await import("@oia/canvas"); // F4: v6 origin compat before any fabric object exists
      const fabric = await import("fabric");
      if (dead) return;
      fabricNSRef.current = fabric;
      const fc = new fabric.Canvas(el, { selection: false, targetFindTolerance: 12, stopContextMenu: true, enablePointerEvents: true });
      fabricRef.current = fc;
      fc.setDimensions({ width: stage.clientWidth, height: stage.clientHeight });
      applyViewToFabric();

      fc.on("mouse:down", (opt) => {
        if (compareOnRef.current) return;
        const t = toolRef.current;
        if (t === "path" || t === "highlight") return; // brush mode owns the gesture
        if (t === "text") {
          const p = scenePt(fc, opt);
          const it = new fabric.IText("", { left: Math.max(0, p.x), top: Math.max(0, p.y), fill: MARK_UI.stroke, fontFamily: "system-ui", fontSize: markStrokeWidth(current?.width ?? 1000, current?.height ?? 1000) * 7, fontWeight: "700", editingBorderColor: "#f59e0b", objectCaching: false });
          fc.add(it);
          fc.setActiveObject(it);
          void it.enterEditing();
          it.on("editing:exited", () => {
            const txt = (it.text ?? "").trim();
            fc.remove(it); // the marks sync redraws it through markToObject
            if (txt && current) pushMark({ id: newMarkId(), kind: "text", note: "", text: txt.slice(0, 200), x: Math.max(0, it.left ?? 0), y: Math.max(0, it.top ?? 0) });
          });
          return;
        }
        if (t === "pan") {
          if (!opt.target) panRef.current = { x: (opt.e as PointerEvent).clientX, y: (opt.e as PointerEvent).clientY, tx: viewRef.current.tx, ty: viewRef.current.ty };
          return; // target hit: fabric starts the move itself
        }
        drawRef.current = { kind: t, from: scenePt(fc, opt), to: scenePt(fc, opt) };
      });
      fc.on("mouse:move", (opt) => {
        if (panRef.current) {
          const stageEl = stageRef.current;
          const e = opt.e as PointerEvent;
          const next = { s: viewRef.current.s, tx: panRef.current.tx + (e.clientX - panRef.current.x), ty: panRef.current.ty + (e.clientY - panRef.current.y) };
          viewRef.current = stageEl && fit ? clampPan(next, stageEl.clientWidth, stageEl.clientHeight, fit.w, fit.h) : next;
          applyViewToFabric();
          setZoomPct(Math.round(viewRef.current.s * 100));
          return;
        }
        const d = drawRef.current;
        if (d) {
          d.to = scenePt(fc, opt);
          updateDraft(fabric, d);
        }
      });
      fc.on("mouse:up", () => {
        if (panRef.current) {
          panRef.current = null;
          return;
        }
        const d = drawRef.current;
        drawRef.current = null;
        if (fabricDraftRef.current) {
          fc.remove(fabricDraftRef.current);
          fabricDraftRef.current = null;
        }
        if (d) commitDraft(d);
      });
      fc.on("mouse:wheel", (opt) => {
        const e = opt.e as WheelEvent;
        e.preventDefault();
        if (compareOnRef.current) return;
        const r = fc.getElement().getBoundingClientRect();
        const v = zoomAt(viewRef.current, e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.12 : 1 / 1.12);
        viewRef.current = v;
        applyViewToFabric();
        setZoomPct(Math.round(v.s * 100));
      });
      fc.on("mouse:dblclick", () => {
        if (compareOnRef.current) return;
        viewRef.current = { s: 1, ...baseRef.current };
        applyViewToFabric();
        setZoomPct(100);
      });
      const fromFabric = (opt: { selected?: import("fabric").Object[]; deselected?: import("fabric").Object[] }) => {
        const id = String((opt.selected?.[0] as unknown as { markId?: string })?.markId ?? "");
        if (!syncingRef.current) setSelectedId(id || null);
      };
      fc.on("selection:created", fromFabric);
      fc.on("selection:updated", fromFabric);
      fc.on("selection:cleared", () => { if (!syncingRef.current) setSelectedId(null); });
      fc.on("text:changed", (opt) => {
        if (syncingRef.current || !current) return;
        const t = opt.target as unknown as { markId?: string; text?: string };
        const id = String(t.markId ?? "");
        if (!id || !t.text) return;
        setMarks((ms) => ms.map((m) => (m.id === id && m.kind === "text" ? { ...m, text: (t.text ?? "").trim().slice(0, 200) || m.text } : m)));
      });
      fc.on("object:modified", (opt) => {
        if (syncingRef.current || !current || !opt.target) return;
        const id = String((opt.target as unknown as { markId?: string }).markId ?? "");
        const prev = marksRef.current.find((m) => m.id === id);
        if (!prev) return;
        setMarks((ms) => ms.map((m) => (m.id === id ? objectToMark(prev, opt.target!, fabric, current.width, current.height) : m)));
      });
      fc.on("path:created", (opt) => {
        const pathObj = opt.path;
        if (!pathObj || !current || compareOnRef.current) return;
        const pts = simplifyPath(pathStrokePoints(pathObj as unknown as import("fabric").Path)).map((q) => ({ x: Math.max(0, Math.min(current.width, q.x)), y: Math.max(0, Math.min(current.height, q.y)) }));
        fc.remove(pathObj); // the sync effect redraws it as a numbered group
        if (pts.length >= 2 && pathLength(pts) >= MIN_ARROW_PX) {
          pushMark({ id: newMarkId(), kind: "path", note: "", thick: toolRef.current === "highlight", pts });
        }
      });
      fc.on("mouse:over", (opt) => {
        const id = String((opt.target as unknown as { markId?: string })?.markId ?? "");
        setHoveredId(id || null);
      });
      fc.on("mouse:out", () => setHoveredId(null));
      setSyncTick((n) => n + 1); // force one marks sync now that the canvas exists
    })();
    return () => {
      dead = true;
      fabricRef.current?.dispose();
      fabricRef.current = null;
      fabricDraftRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [current, fit]);

  // marks → fabric objects. Full rebuild: cheap for <= 40 groups and it can
  // never drift from the truth (panel edits, Delete, carry-over, restore).
  useEffect(() => {
    const fc = fabricRef.current;
    const fabric = fabricNSRef.current;
    if (!fc || !fabric) return;
    syncingRef.current = true;
    fc.discardActiveObject();
    fc.remove(...fc.getObjects());
    if (!compareOn && current) {
      marks.forEach((m, i) => {
        const o = markToObject(fabric, m, i, current.width, current.height);
        const o2 = o as unknown as { prevLeft?: number; prevTop?: number };
        o2.prevLeft = o.left;
        o2.prevTop = o.top;
        if (m.id === hoveredId) o.set({ opacity: 0.65 });
        fc.add(o);
        if (m.id === selectedId) fc.setActiveObject(o);
      });
    }
    fc.requestRenderAll();
    syncingRef.current = false;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [marks, selectedId, hoveredId, compareOn, current, syncTick]);

  // tool → canvas modes: draw tools ignore objects (a drag is a new region),
  // pan doubles as select (Canva-style: grab a mark, or the empty space pans)
  useEffect(() => {
    const fc = fabricRef.current;
    const fabric = fabricNSRef.current;
    if (!fc || !fabric || !current) return;
    const freehand = tool === "path" || tool === "highlight";
    fc.isDrawingMode = freehand && !compareOn;
    if (fc.isDrawingMode) {
      const brush = new fabric.PencilBrush(fc);
      brush.color = MARK_UI.stroke;
      brush.width = markStrokeWidth(current.width, current.height) * (tool === "highlight" ? 3 : 1);
      fc.freeDrawingBrush = brush;
    }
    fc.selection = tool === "pan" && !compareOn;
    fc.skipTargetFind = (tool !== "pan" && tool !== "text") || compareOn;
    fc.defaultCursor = compareOn ? "default" : tool === "pan" ? "grab" : tool === "text" ? "text" : "crosshair";
    fc.requestRenderAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tool, compareOn, current, syncTick]);

  // elapsed seconds tick while a job runs (the run bar under the tools)
  const [, setRunTick] = useState(0);
  useEffect(() => {
    if (!busy) return;
    const t = setInterval(() => setRunTick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, [busy]);
  const elapsedS = startedAt ? Math.floor((Date.now() - startedAt) / 1000) : null;

  /** zoom cluster helpers: zoom keeps the STAGE CENTER pinned (cursor pinning
   * stays on the wheel); % resets, Fit returns to the centered base view. */
  function stageZoom(factor: number) {
    const stage = stageRef.current;
    const cx = stage ? stage.clientWidth / 2 : 0;
    const cy = stage ? stage.clientHeight / 2 : 0;
    const v = zoomAt(viewRef.current, cx, cy, factor);
    viewRef.current = v;
    applyViewToFabric();
    setZoomPct(Math.round(v.s * 100));
  }
  function fitView() {
    viewRef.current = { s: 1, ...baseRef.current };
    applyViewToFabric();
    setZoomPct(100);
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
      } else if (e.key === "4") {
        setTool("oval");
        setCompareOn(false);
      } else if (e.key === "5") {
        setTool("path");
        setCompareOn(false);
      } else if (e.key === "6") {
        setTool("highlight");
        setCompareOn(false);
      } else if (e.key === "7") {
        setTool("text");
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
    <main
      className="studioPage loopView loopCanvasFirst"
      aria-label="Edit loop"
      onDragOver={current ? undefined : (e) => e.preventDefault()}
      onDrop={current ? undefined : onAttachDrop}
    >
      {!current && !displayed && busy && (
          <section className="loopStage loopEmptyBare" aria-label="Canvas">
            <div className="loopEmptyRun">
              <RunPanel busy={busy} steps={stepsFromTimeline(timeline)} narrative={narrative} notesOpen={notesOpen} onToggleNotes={setNotesOpen} startedAt={startedAt} summarySeconds={genSeconds} />
            </div>
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
              <button className={`loopTool ${tool === "oval" && !compareOn ? "active" : ""}`} data-testid="tool-oval" aria-pressed={tool === "oval"} title="Circle a round region (4)" onClick={() => { setTool("oval"); setCompareOn(false); }}>{Icon.oval}<span>Oval</span><kbd>4</kbd></button>
              <button className={`loopTool ${tool === "path" && !compareOn ? "active" : ""}`} data-testid="tool-path" aria-pressed={tool === "path"} title="Draw freely around a detail (5)" onClick={() => { setTool("path"); setCompareOn(false); }}>{Icon.pen}<span>Draw</span><kbd>5</kbd></button>
              <button className={`loopTool ${tool === "highlight" && !compareOn ? "active" : ""}`} data-testid="tool-highlight" aria-pressed={tool === "highlight"} title="Highlight a broad area with a wide stroke (6)" onClick={() => { setTool("highlight"); setCompareOn(false); }}>{Icon.highlight}<span>Highlight</span><kbd>6</kbd></button>
              <button className={`loopTool ${tool === "text" && !compareOn ? "active" : ""}`} data-testid="tool-text" aria-pressed={tool === "text"} title="Write a note right on the image (7)" onClick={() => { setTool("text"); setCompareOn(false); }}>{Icon.textType}<span>Note</span><kbd>7</kbd></button>
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
            <div className={`loopStage ${compareOn ? "loopCompare" : ""}`} ref={stageRef} data-testid="loop-stage" onDragOver={(e) => e.preventDefault()} onDrop={onImportDrop}>
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
              <canvas ref={overlayRef} className="loopOverlay" data-testid="loop-overlay" />
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
            {marks.length > 0 && (
              <input
                aria-label="Overall instruction for the whole image"
                data-testid="loop-global-note"
                placeholder="Overall (optional): one sentence for everything marked"
                value={globalNote}
                onChange={(e) => setGlobalNote(e.target.value)}
              />
            )}
            {marks.length === 0 && <p className="loopEmpty">Pick Box or Arrow and drag on the image. Each region gets its own instruction.</p>}
            {marks.length > 0 && <p className="loopEmpty loopKeyHint">Click a region to select it, Delete removes it. Keys 1, 2, 3 switch tools.</p>}
            <ol className="loopRegions">
              {marks.map((m, i) => (
                <li key={m.id} className={`loopRegion ${m.id === selectedId ? "selected" : ""}`} data-testid={`region-${i + 1}`} onClick={() => setSelectedId((cur) => (cur === m.id ? null : m.id))} onMouseEnter={() => setHoveredId(m.id)} onMouseLeave={() => setHoveredId(null)}>
                  <span className="regionChip" aria-hidden="true">{i + 1}</span>
                  <span className="regionKind" aria-hidden="true">{m.kind === "box" ? Icon.box : m.kind === "oval" ? Icon.oval : m.kind === "path" ? (m.thick ? Icon.highlight : Icon.pen) : m.kind === "text" ? Icon.textType : Icon.arrowUp}</span>
                  {m.kind === "text" ? (
                    <span className="regionTextNote" title="Written on the image">“{m.text}”</span>
                  ) : (
                    <input
                      aria-label={`Region ${i + 1} instruction`}
                      data-testid={`region-note-${i + 1}`}
                      className={!m.note.trim() && marks.length && notesMissing ? "invalid" : ""}
                      value={m.note}
                      placeholder="What should change here?"
                      onFocus={() => setSelectedId(m.id)}
                      onChange={(e) => updateNote(m.id, e.target.value)}
                    />
                  )}
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
        {current && !compareOn && (
          <div className="loopAttachRow" data-testid="loop-intent">
            <div className="loopAttachModes" role="radiogroup" aria-label="What to do with this image">
              <button type="button" className={`loopModePill ${attachMode === "edit" ? "active" : ""}`} role="radio" aria-checked={attachMode === "edit"} data-testid="loop-mode-edit" onClick={() => setAttachMode("edit")}>{Icon.pen}<span>Edit this image</span></button>
              <button type="button" className={`loopModePill ${attachMode === "new" ? "active" : ""}`} role="radio" aria-checked={attachMode === "new"} data-testid="loop-mode-new" onClick={() => setAttachMode("new")}>{Icon.sparkle}<span>New image with it</span></button>
            </div>
          </div>
        )}
        {attach && (
          <div className="loopAttachRow" data-testid="loop-attach-preview">
            <img src={attach.dataUrl} alt="Attached image" />
            <span className="mono">{attach.width} × {attach.height}</span>
            <div className="loopAttachModes" role="radiogroup" aria-label="What to do with this photo">
              <button type="button" className={`loopModePill ${attachMode === "edit" ? "active" : ""}`} role="radio" aria-checked={attachMode === "edit"} data-testid="loop-mode-edit" onClick={() => setAttachMode("edit")}>{Icon.pen}<span>Edit this photo</span></button>
              <button type="button" className={`loopModePill ${attachMode === "new" ? "active" : ""}`} role="radio" aria-checked={attachMode === "new"} data-testid="loop-mode-new" onClick={() => setAttachMode("new")}>{Icon.sparkle}<span>New image with it</span></button>
            </div>
            <button className="iconBtn" aria-label="Remove the attached image" onClick={() => setAttach(null)}>{Icon.x}</button>
          </div>
        )}
        <textarea
          aria-label="Image idea"
          data-testid="loop-idea"
          value={prompt}
          placeholder={attach || current ? (attachMode === "new" ? "Describe the new image around this product… (e.g. a warm wooden table, morning light)" : attach ? "Describe what to change in this photo…" : "Ask for a change, or mark regions above…") : "Describe an idea, or upload a photo to edit…"}
          rows={current || attach ? 1 : 2}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composerControls">
          {!current && (
            <>
              <button className="composerIconBtn" aria-label="Upload an image to edit" data-testid="loop-attach" title="Upload a PNG/JPEG/WebP from this computer" onClick={() => attachInputRef.current?.click()}>{Icon.upload}</button>
              <button className={`composerIconBtn ${assetsOpen ? "active" : ""}`} aria-label="Pick one of your saved images" aria-expanded={assetsOpen} data-testid="loop-assets" title="Your images in this app" onClick={() => void openAssets()}>{Icon.gallery}</button>
              <input ref={attachInputRef} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void pickAttach(f); e.target.value = ""; }} />
              {assetsOpen && (
                <div className="loopAssetsPop" role="dialog" aria-label="Your images">
                  {assets.length === 0 && <p className="loopAssetsEmpty">Nothing here yet - generated and uploaded images land in this library.</p>}
                  <div className="loopAssetsGrid">
                    {assets.map((a) => (
                      <button key={a.key} className="loopAssetThumb" title={a.key} onClick={() => void pickAsset(a.key)}>
                        <img src={`oia://files/${a.key}`} alt="" loading="lazy" />
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          <select aria-label="Aspect ratio" value={aspect} onChange={(e) => setAspect(e.target.value)}>
            <option value="auto">Auto ratio</option>
            {Object.keys(LOOP_ASPECTS).filter((a) => a !== "auto").map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Style preset" data-testid="loop-style" value={stylePreset} onChange={(e) => { const v = e.target.value as StylePresetId | ""; setStylePreset(v); writeStylePref(v); }}>
            <option value="">Auto style</option>
            {STYLE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="composerSpacer" />
          {busy ? (
            <button className="generateBtn labeled stop" aria-label={STOP_LABEL} title={STOP_LABEL} onClick={() => void stop()}>{Icon.stop}Stop</button>
          ) : (
            <button className="generateBtn labeled" aria-label={attach || current ? (prompt.trim() ? (attachMode === "new" ? "Create a new image with it" : "Edit image") : "Add the attached image to the canvas") : "Generate image"} data-testid="loop-generate" disabled={!prompt.trim() && !attach} onClick={() => void submit()}>{attach || current ? (prompt.trim() ? (attachMode === "new" ? "Create" : "Edit") : attach ? "Add" : "Edit") : "Generate"}{Icon.send}</button>
          )}
        </div>
        {!busy && !current && (
          <p className="loopBarCaption">
            <CostHint
              testId="loop-cost"
              text={costHintText({ images: 1, isMock: mockMode, autoRefineRounds: autoRefinePref ? AUTO_REFINE_MAX_ROUNDS_DEFAULT : 0 })}
            />
          </p>
        )}
      </section>
    </main>
  );
}
