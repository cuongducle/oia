import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode, Component } from "react";
import type * as fabricNS from "fabric";
import type { SceneCanvas, ChatEvent, Template, DeconstructText } from "@oia/schema";
import {
  SIZE_PRESETS, SHAPES, TEXT_PRESET_SPECS, planExport, resizeWithLock,
  addPage, removePage as removePageModel, duplicatePage, blankScene, applySizeToAllPages,
  stampUser, variantArtworkObject, replaceObjectSrc, normalizeImageScales, applyLocks,
  type ExportFormat, type ExportScope, type ShapeKind, type TextPreset, type SizePresetName, type EditorPage, type LayerObject,
} from "@oia/canvas";
import { stripMarkers } from "@oia/protocol";
import { STUDIO_TEMPLATES } from "../lib/studio-templates.js";
import { LIVESTREAM_TEMPLATES } from "../lib/livestream-presets.js";
import { guideFor, guideRects, readGuidePref, writeGuidePref, type GuidePlatform } from "../lib/live-guides.js";
import { ASPECT_TOLERANCE, isNineSixteen } from "../lib/scene-dims.js";
import { appendVariant, bindPromptForJob, bindTargetForJob, canReplaceVariant, variantKey, variantsFromSession, type VariantCard } from "../lib/variant-tray.js";
import { Dialog } from "../components/Dialog.js";
import { ScenePreview } from "../components/ScenePreview.js";
import { RunSteps } from "../components/RunSteps.js";
import { LayersPanel } from "../components/LayersPanel.js";
import { Inspector } from "../components/Inspector.js";
import { ContextToolbar } from "../components/ContextToolbar.js";
import { stepsFromTimeline } from "../lib/run-steps.js";
import { loadSceneFonts } from "../lib/scene-fonts.js";
import { matchedDeconstructScene } from "../lib/deconstruct-font-match.js";
import { pollTask } from "../lib/poll-task.js";
import { resolveEditTarget } from "../lib/edit-target.js";
import { viewportToNatural, naturalToViewport, markupComposite, type Stroke } from "../lib/markup-annotate.js";
import { marqueeToClipRect, clampMarquee, shadeRects, type Rect } from "../lib/crop.js";
import { dataUrlBytes } from "../lib/data-url.js";
import type { ChatRequest } from "@oia/services";
import { oia, bridgeErrorMessage } from "../lib/bridge.js";
import { clampZoom } from "../lib/zoom.js";
import { presentErrorEn } from "../lib/errors.js";
import { mapAssetUrls, unmapAssetUrls, toDisplayUrl, toCanonicalUrl } from "../../shared/assets.js";

/**
 * D2 renderer port, the fullscreen editing shell over IPC + @oia/canvas:
 * canvas/layers/text/shapes/tables/draw, undo/redo, autosave by projectId (TP.7),
 * the AI dock refine flow with the TP.10 non-destruction merge, marketplace size
 * presets, template gallery, and native-dialog export (PNG/JPG/PDF/PPTX/ZIP).
 * The web editor is the source; only the transport changed (fetch → typed IPC).
 *
 * UI copy is ENGLISH by owner decision (design doc, D2 remainder): Vietnamese is
 * supported at the content/font level only, never in interface strings.
 */

const STOP_LABEL = "Stop";

type Panel = "templates" | "assets" | "text" | "shapes" | "tables" | "draw" | "layers" | "page";
const RAIL: Panel[] = ["templates", "assets", "text", "shapes", "tables", "draw", "layers", "page"];

export interface EditorProps {
  projectId: string | null;
  onExit: () => void;
  /** A1 preview-apply, "Open in editor" on a variant opens it as a NEW project. */
  onOpenProject: (id: string) => void;
}

/* Small inline icon set (lucide is a web dep, the desktop keeps zero extra deps). */
const I = ({ d, size = 17 }: { d: string; size?: number }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);
const icons = {
  back: "M19 12H5M11 18l-6-6 6-6",
  undo: "M3 7v6h6M3 13a9 9 0 1 0 3-7.7L3 7",
  redo: "M21 7v6h-6M21 13a9 9 0 1 1-3-7.7L21 7",
  cloud: "M17.5 19a4.5 4.5 0 1 0-.4-8.98A7 7 0 1 0 6 17.7",
  spark: "M12 3l1.9 5.7L19.6 10l-5.7 1.9L12 17.6l-1.9-5.7L4.4 10l5.7-1.3L12 3z",
  globe: "M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18 14 14 0 0 1 0-18z",
  download: "M12 3v12m0 0l-4-4m4 4l4-4M4 21h16",
  plus: "M12 5v14M5 12h14",
  minus: "M5 12h14",
  fit: "M8 3H3v5M16 3h5v5M8 21H3v-5M16 21h5v-5",
  hand: "M18 11V6a2 2 0 0 0-4 0v5M14 10V4a2 2 0 0 0-4 0v6M10 10.5V6a2 2 0 0 0-4 0v10a8 8 0 0 0 8 8h2l4-6.5c.6-1-.2-2.3-1.4-2.2L18 11",
  copy: "M9 9h10v10a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2V9zM5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1",
  x: "M18 6L6 18M6 6l12 12",
  up: "M12 19V5M5 12l7-7 7 7",
  paperclip: "M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8M3 3v5h5M12 7v5l3 3",
  chevronsUp: "M17 11l-5-5-5 5M17 18l-5-5-5 5",
  chevronUp: "M6 15l6-6 6 6",
  chevronDown: "M6 9l6 6 6-6",
  chevronsDown: "M7 13l5 5 5-5M7 6l5 5 5-5",
};

/** A Replace target must be an image layer (has a src), pins the button state. */
function hasSrc(o: fabricNS.Object | undefined): boolean {
  return typeof (o as { src?: unknown } | undefined)?.src === "string";
}

/** Fabric never serializes selectable/evented, re-derive locks after every load (R4). */
function relock(c: fabricNS.Canvas): void {
  // SAFETY: LayerObject is a structural subset of FabricObject.
  applyLocks(c.getObjects() as unknown as LayerObject[]);
}

export function Editor({ projectId: initialProjectId, onExit, onOpenProject }: EditorProps) {
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabricNS.Canvas | null>(null);
  const [canvas, setCanvas] = useState<fabricNS.Canvas | null>(null); // panels subscribe to it (R4/R5)
  const [rightTab, setRightTab] = useState<"design" | "ai">("ai");
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [variantsSeen, setVariantsSeen] = useState(0); // the AI tab badge counts variants that landed while Design was open
  const [panel, setPanel] = useState<Panel | null>(null);
  const canvasAreaRef = useRef<HTMLElement>(null);
  const aiFileRef = useRef<HTMLInputElement>(null);
  const sceneDimensions = useRef({ width: 1360, height: 2048 });
  const autoFit = useRef(true);
  const [notice, setNotice] = useState("");
  const [projectName, setProjectName] = useState("Untitled project");
  const [hasScene, setHasScene] = useState(false);
  const [selectedText, setSelectedText] = useState(false);
  const [hasTextLayer, setHasTextLayer] = useState(false); // poster-mode pages carry baked text, the edit path is regenerate (D16/SurgePix lane)
  const [zoom, setZoom] = useState(0.35);
  const [zoomText, setZoomText] = useState<string | null>(null); // null = not typing; mirrors the bar while editing
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [exporting, setExporting] = useState(false);
  const [customW, setCustomW] = useState(1360);
  const [customH, setCustomH] = useState(2048);
  // BR-PERSIST editor: project store + auto-save + undo/redo (all over IPC)
  const [projectId, setProjectId] = useState<string | null>(initialProjectId);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // AI dock (BR gap #3), the same chat stream and cancel as the web dock; A1
  // preview-apply adds the variant tray + conversation pinning (VA-1)
  const [aiOpen, setAiOpen] = useState(true);
  const [aiPrompt, setAiPrompt] = useState("");
  const aiPromptRef = useRef(""); // mirrors aiPrompt, event handlers outlive render closures
  useEffect(() => { aiPromptRef.current = aiPrompt; }, [aiPrompt]);
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTimeline, setAiTimeline] = useState<{ content: string; done: boolean; sub?: boolean }[]>([]);
  const aiJobRef = useRef<string | null>(null);
  const aiOffRef = useRef<(() => void) | null>(null);
  const [aiError, setAiError] = useState<{ message: string; actionLabel?: string } | null>(null);
  const [refCapable, setRefCapable] = useState(true);
  const [markupCapable, setMarkupCapable] = useState(false); // ME, the Circle-to-edit button only on markup-capable channels
  const [aiRefs, setAiRefs] = useState<string[]>([]); // explicit AI-dock attachments (canonical)
  const [aiUploading, setAiUploading] = useState(false);
  const [aiNarrative, setAiNarrative] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chats, setChats] = useState<{ id: number; name: string; updatedAt: number }[]>([]);
  const [selectedImg, setSelectedImg] = useState(false); // an image layer is active (enables Replace)
  const [selectedName, setSelectedName] = useState<string | null>(null); // its NAME, A3-lite: variants only replace the layer they were painted for
  const [imageMock, setImageMock] = useState(false); // "≈ 1 image" label only when a real provider
  const [aiSessionId, setAiSessionId] = useState<number | null>(null); // VA-1 conversation pin
  const [variants, setVariants] = useState<VariantCard[]>([]);
  const [hiddenVariants, setHiddenVariants] = useState<Set<string>>(new Set()); // "Not now", view state, never persisted (VA-7)
  const aiPromptByJobRef = useRef<Map<string, string>>(new Map()); // per-job prompt binding (B7), rules in variant-tray.ts
  const aiTargetRef = useRef<string | null>(null); // the layer the CURRENT edit targets (A3-lite), captured at send, bound per job at first event
  const aiLastImageRef = useRef<string | null>(null); // LAST image layer the user picked, survives selection:cleared (teardown #1: fabric can drop the active object mid-flow)
  const aiTargetByJobRef = useRef<Map<string, string | null>>(new Map());
  // Templates/Assets/Draw
  const [tplList, setTplList] = useState<Template[]>([]);
  const [assets, setAssets] = useState<string[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [panning, setPanning] = useState(false);
  const [pageThumbs, setPageThumbs] = useState<Record<string, string>>({});
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [activePage, setActivePage] = useState(0);
  // C3: safe-zone guides (live-overlay-presets.md LV-4/LV-6/LV-11): view state +
  // localStorage pref. NEVER scene data, rendered as a DOM layer over the canvas.
  const [guidePlatform, setGuidePlatform] = useState<GuidePlatform>(readGuidePref);
  const guidesEligible = isNineSixteen(customW, customH);
  const guidesOn = guidePlatform !== "off" && guidesEligible;
  const activeGuide = guidePlatform === "off" ? null : guideFor(guidePlatform);
  const activeClipFill = pages[activePage]?.canvas?.objects?.find((o) => o.name === "clip")?.fill;
  function cycleGuides() {
    const order: GuidePlatform[] = ["off", "tiktok", "shopee"];
    const next = order[(order.indexOf(guidePlatform) + 1) % order.length];
    setGuidePlatform(next);
    writeGuidePref(next);
  }
  const currentState = useRef({ pages, activePage, projectName, projectId, customW, customH });
  const restoring = useRef(false);
  const pendingSave = useRef<Promise<string | null> | null>(null);
  useEffect(() => { currentState.current = { pages, activePage, projectName, projectId, customW, customH }; }, [pages, activePage, projectName, projectId, customW, customH]);

  useEffect(() => {
    void oia().providerStatus().then((s) => {
      setRefCapable(Boolean(s.image.capabilities.referenceImages));
      setMarkupCapable(s.image.capabilities.markupEdit === "flatten");
      setImageMock(Boolean(s.image.capabilities.isMock));
    }).catch(() => {});
  }, []);

  function captureThumb(idx: number) {
    const c = fabricRef.current; if (!c) return;
    try {
      const url = c.toDataURL({ format: "png", multiplier: 60 / Math.max(c.getWidth(), 1) } as never);
      const id = currentState.current.pages[idx]?.id;
      if (id) setPageThumbs((t) => ({ ...t, [id]: url }));
    } catch { /* canvas not rendered yet */ }
  }

  /** Snapshot the active page into CANONICAL form (oia:// display srcs → /api/files). */
  const snapshotActive = useCallback((): EditorPage | null => {
    const c = fabricRef.current;
    if (!c) return null;
    const scene = unmapAssetUrls(c.toObject() as unknown as EditorPage["canvas"]);
    return { id: pages[activePage]?.id ?? `page_${activePage}`, canvas: scene };
  }, [pages, activePage]);

  const syncHasText = (c: fabricNS.Canvas | null) => setHasTextLayer(Boolean(c?.getObjects().some((o) => o.type === "textbox")));
  const loadPage = useCallback(async (idx: number, list: EditorPage[]) => {
    const c = fabricRef.current; if (!c) return;
    restoring.current = true;
    try {
      await loadSceneFonts(list[idx].canvas);
      await c.loadFromJSON(mapAssetUrls(list[idx].canvas));
      const size = sceneSize(list[idx].canvas);
      sceneDimensions.current = size; setCustomW(size.width); setCustomH(size.height);
      normalizeImageScales(c); // paint fills the declared box (mock plates, mismatched uploads)
      relock(c);
      c.getObjects().forEach(o => { if ("fontFamily" in o && o.fontFamily === "Be Vietnam Pro") o.set("fontFamily" as never, fontStack() as never); });
      undoStack.current = [JSON.stringify(c.toObject())]; redoStack.current = [];
      setCanUndo(false); setCanRedo(false); setSelectedText(false); setSelectedImg(false); syncHasText(c); fitView();
      c.requestRenderAll(); captureThumb(idx);
    } finally { restoring.current = false; }
    scheduleSave();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (window.matchMedia("(max-width:600px)").matches) setAiOpen(false);
    const el = canvasAreaRef.current; if (!el) return;
    const observer = new ResizeObserver(() => {
      if (!autoFit.current || !fabricRef.current) return;
      const { width, height } = sceneDimensions.current;
      const z = fitArtboard(width, height, el.clientWidth, el.clientHeight);
      setZoom(z); applyZoom(fabricRef.current, z);
    });
    observer.observe(el); return () => observer.disconnect();
  }, []);
  useEffect(() => {
    sceneDimensions.current = { width: customW, height: customH };
    if (autoFit.current) fitView();
  }, [customW, customH]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setExportOpen(false); setHistoryOpen(false); setPanel(null); if (cropRef.current) cancelCrop(); } };
    const shortcuts = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))) return;
      if (e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) void redoOp(); else void undo(); }
      else if (e.key.toLowerCase() === "y") { e.preventDefault(); void redoOp(); }
    };
    window.addEventListener("keydown", esc); window.addEventListener("keydown", shortcuts);
    return () => { window.removeEventListener("keydown", esc); window.removeEventListener("keydown", shortcuts); };
  }, []);

  // AI dock: subscribe to the bridge chat stream once; canvas msgMetas merge TP.10-style
  useEffect(() => {
    aiOffRef.current = oia().onChatEvent((ev) => {
      if (!aiJobRef.current) { if (ev.jobId) aiJobRef.current = ev.jobId; else return; }
      if (ev.jobId && ev.jobId !== aiJobRef.current) return; // concurrent jobs never interleave
      if (ev.status === "cancelled") { setAiError({ message: presentErrorEn("cancelled").message }); return; }
      if (ev.error) {
        const p = presentErrorEn(ev.errorClass);
        setAiError({ message: p.message, actionLabel: p.actionLabel });
      }
      if (ev.renderData?.taskMeta?.length) setAiTimeline(ev.renderData.taskMeta.map((tm) => ({ content: tm.content, done: tm.status === "1", sub: tm.type === "substep" })));
      if (ev.content) setAiNarrative((n) => n + stripMarkers(ev.content) + " ");
      for (const m of ev.renderData?.msgMeta ?? []) {
        if (m.type === "canvas") {
          // A1 preview-apply (VA-3): the canvas NEVER mutates on arrival, each canvas
          // meta becomes a variant card; TP.10 non-destruction now lives in the apply
          // step (replaceObjectSrc touches one user-designated object's src).
          // Dedupe + per-job prompt rules live in variant-tray.ts (unit-tested there).
          const jobId = ev.jobId ?? "";
          const card: VariantCard = {
            id: crypto.randomUUID(),
            key: variantKey(ev.jobId, m.id),
            jobId,
            prompt: bindPromptForJob(aiPromptByJobRef.current, jobId, aiPromptRef.current),
            targetLayer: bindTargetForJob(aiTargetByJobRef.current, jobId, aiTargetRef.current) ?? undefined,
            thumbnail: typeof m.thumbnail === "string" ? m.thumbnail : "",
            canvas: m.canvas as SceneCanvas,
          };
          setVariants((vs) => appendVariant(vs, card));
        }
      }
    });
    return () => aiOffRef.current?.();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // load fabric + the project (by id, TP.7: handoff is by projectId only)
  useEffect(() => {
    let cancelled = false;
    let owned: fabricNS.Canvas | null = null;
    (async () => {
      const { createEditor } = await import("@oia/canvas");
      if (cancelled || !canvasElRef.current) return;
      const editor = await createEditor(canvasElRef.current);
      owned = editor;
      if (cancelled) { void editor.dispose(); return; }
      fabricRef.current = editor;
      setCanvas(editor);

      let initialName = "Untitled project";
      let initialPages: EditorPage[] | null = null;
      if (initialProjectId) {
        const p = await oia().getProject(initialProjectId);
        if (!p) throw new Error("Project not found");
        initialName = p.name;
        initialPages = p.pages as unknown as EditorPage[];
      }
      if (cancelled) return;
      setProjectName(initialName);
      if (initialPages && initialPages.length) {
        setPages(initialPages); setActivePage(0);
        const fontNote = initialPages[0].canvas.deconstructFontNote;
        if (typeof fontNote === "string") setNotice(fontNote);
        await loadSceneFonts(initialPages[0].canvas);
        await editor.loadFromJSON(mapAssetUrls(initialPages[0].canvas));
        editor.requestRenderAll();
        setHasScene(true);
        const size = sceneSize(initialPages[0].canvas);
        setCustomW(size.width); setCustomH(size.height);
      } else {
        editor.setDimensions({ width: 1360, height: 2048 });
        const fabric = await import("fabric");
        editor.add(new fabric.Rect({ left: 0, top: 0, width: 1360, height: 2048, fill: "#ffffff", selectable: false, name: "clip" }));
      }
      if (cancelled) return;
      const first = initialPages?.[0]?.canvas;
      sceneDimensions.current = first ? sceneSize(first) : { width: 1360, height: 2048 };
      if (!initialPages?.length) setPages([{ id: "page_1", canvas: (first ?? editor.toObject()) as SceneCanvas }]);
      await document.fonts.ready;
      normalizeImageScales(editor);
      relock(editor);
      editor.getObjects().forEach(o => { if ("fontFamily" in o && o.fontFamily === "Be Vietnam Pro") o.set("fontFamily" as never, fontStack() as never); });
      const el = canvasAreaRef.current;
      const initialZoom = fitArtboard(sceneDimensions.current.width, sceneDimensions.current.height, el?.clientWidth || 700, el?.clientHeight || 700);
      setZoom(initialZoom); applyZoom(editor, initialZoom);
      undoStack.current = [JSON.stringify(editor.toObject())];
      setTimeout(() => captureThumb(0), 150);

      (window as unknown as { __oiaCanvas?: fabricNS.Canvas }).__oiaCanvas = editor;
      const pushHistory = () => {
        if (restoring.current) return;
        undoStack.current.push(JSON.stringify(editor.toObject()));
        if (undoStack.current.length > 40) undoStack.current.shift();
        redoStack.current = [];
        setCanUndo(true); setCanRedo(false);
        scheduleSave();
      };
      editor.on("object:added", pushHistory);
      editor.on("object:removed", pushHistory);
      editor.on("object:modified", pushHistory);
      editor.on("object:added", () => syncHasText(editor));
      editor.on("object:removed", () => syncHasText(editor));
      editor.on("selection:created", (e) => { setSelectedText(e.selected?.[0]?.type === "textbox"); setSelectedImg(hasSrc(e.selected?.[0])); const nm = ((e.selected?.[0] as (fabricNS.Object & { name?: string }) | undefined)?.name) ?? null; setSelectedName(nm); if (hasSrc(e.selected?.[0])) aiLastImageRef.current = nm; });
      editor.on("selection:updated", (e) => { setSelectedText(e.selected?.[0]?.type === "textbox"); setSelectedImg(hasSrc(e.selected?.[0])); const nm = ((e.selected?.[0] as (fabricNS.Object & { name?: string }) | undefined)?.name) ?? null; setSelectedName(nm); if (hasSrc(e.selected?.[0])) aiLastImageRef.current = nm; });
      editor.on("selection:cleared", () => { setSelectedText(false); setSelectedImg(false); setSelectedName(null); });
      if (!initialProjectId) scheduleSave();
    })().catch(() => { if (!cancelled) setNotice("Could not open the design. Go back and try another project."); });
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (fabricRef.current === owned) { fabricRef.current = null; setCanvas(null); }
      void owned?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyZoom(c: fabricNS.Canvas, z: number) {
    c.setViewportTransform([z, 0, 0, z, 0, 0]);
    c.setDimensions({ width: Math.round(sceneDimensions.current.width * z), height: Math.round(sceneDimensions.current.height * z) });
    c.requestRenderAll();
  }
  function fitView() {
    autoFit.current = true;
    const el = canvasAreaRef.current, c = fabricRef.current; if (!el || !c) return;
    const { width, height } = sceneDimensions.current;
    const z = fitArtboard(width, height, el.clientWidth, el.clientHeight);
    setZoom(z); applyZoom(c, z);
  }
  function zoomBy(d: number) {
    autoFit.current = false;
    const z = clampZoom(zoom + d);
    setZoom(z);
    if (fabricRef.current) applyZoom(fabricRef.current, z);
  }
  /** Typed zoom commits on blur/Enter, committing per keystroke would clamp "1…"
   * mid-typing and destroy multi-digit input. */
  function commitZoomText() {
    if (zoomText === null) return;
    setZoomText(null);
    const v = Number(zoomText);
    if (!Number.isFinite(v)) return;
    autoFit.current = false;
    const z = clampZoom(v / 100);
    setZoom(z);
    if (fabricRef.current) applyZoom(fabricRef.current, z);
  }

  /** Read latest state from refs: Fabric listeners live longer than their initial React render. */
  function scheduleSave() {
    if (restoring.current) return;
    setSaveState("dirty");
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => { void persistProject(); }, 1200);
  }
  async function persistProject(): Promise<string | null> {
    if (pendingSave.current) { await pendingSave.current; }
    const state = currentState.current, c = fabricRef.current;
    if (!c || !state.pages.length) return null;
    setSaveState("saving");
    const snap = unmapAssetUrls(c.toObject() as SceneCanvas);
    const list = state.pages.map((p, i) => i === state.activePage ? { ...p, canvas: snap } : p);
    const payload = { name: state.projectName, pages: list.map((p, i) => ({ ...p, name: `Page ${i + 1}`, ...sceneSize(p.canvas) })) };
    const request = (async () => {
      try {
        const saved = state.projectId
          ? await oia().saveProject(state.projectId, payload)
          : await oia().createProject(payload);
        if (!saved) throw new Error("save failed");
        const id = state.projectId ?? saved.id;
        currentState.current.projectId = id; setProjectId(id);
        setSaveState("saved");
        setSavedAt(new Date());
        if (currentState.current.activePage === state.activePage) captureThumb(state.activePage);
        return id as string;
      } catch (e) {
        setSaveState("dirty");
        setNotice(bridgeErrorMessage(e, "Your design could not be saved. Please try again."));
        return null;
      }
    })();
    pendingSave.current = request;
    try { return await request; } finally { pendingSave.current = null; }
  }

  async function undo() {
    const c = fabricRef.current; if (!c || undoStack.current.length < 2) return;
    redoStack.current.push(undoStack.current.pop()!);
    const prev = undoStack.current.at(-1)!;
    restoring.current = true;
    try { await c.loadFromJSON(JSON.parse(prev)); relock(c); const size = sceneSize(c.toObject() as SceneCanvas); sceneDimensions.current = size; setCustomW(size.width); setCustomH(size.height); fitView(); } finally { restoring.current = false; }
    setSelectedText(false); setSelectedImg(false); setSelectedName(null); // the reloaded page clears selection, state must not lie
    setCanUndo(undoStack.current.length >= 2); setCanRedo(true);
    scheduleSave();
  }
  async function redoOp() {
    const c = fabricRef.current; if (!c || !redoStack.current.length) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(next);
    restoring.current = true;
    try { await c.loadFromJSON(JSON.parse(next)); relock(c); const size = sceneSize(c.toObject() as SceneCanvas); sceneDimensions.current = size; setCustomW(size.width); setCustomH(size.height); fitView(); } finally { restoring.current = false; }
    setSelectedText(false); setSelectedImg(false);
    setCanUndo(true); setCanRedo(redoStack.current.length > 0);
    scheduleSave();
  }

  const callCanvas = useCallback(async (fn: (c: fabricNS.Canvas) => void) => {
    if (!fabricRef.current) return;
    fn(fabricRef.current);
  }, []);

  async function opAddPage() {
    const snap = snapshotActive();
    const list = snap ? pages.map((p, i) => (i === activePage ? snap : p)) : pages;
    const r = addPage(list, customW, customH);
    setPages(r.pages); setActivePage(r.activeIndex);
    await loadPage(r.activeIndex, r.pages);
  }
  async function opDuplicatePage() {
    const snap = snapshotActive();
    const list = snap ? pages.map((p, i) => (i === activePage ? snap : p)) : pages;
    const r = duplicatePage(list, activePage);
    setPages(r.pages); setActivePage(r.activeIndex);
    await loadPage(r.activeIndex, r.pages);
  }
  async function opRemovePage() {
    const r = removePageModel(pages, activePage);
    if (r.pages === pages) return; // BR-PG2: never delete the last page
    setPages(r.pages); setActivePage(r.activeIndex);
    await loadPage(r.activeIndex, r.pages);
  }
  async function opSwitchPage(idx: number) {
    if (idx === activePage) return;
    const snap = snapshotActive();
    const list = snap ? pages.map((p, i) => (i === activePage ? snap : p)) : pages;
    setPages(list); setActivePage(idx);
    await loadPage(idx, list);
  }

  async function publishTemplate() {
    const snap = snapshotActive();
    if (!snap) return;
    try {
      const res = await oia().createTemplate({ name: projectName, authorName: "You", scene: snap.canvas });
      setNotice(res.warnings.length
        ? `Published with notes: ${res.warnings.join(" · ")}`
        : "Published to your template library.");
    } catch (e) {
      setNotice(bridgeErrorMessage(e, "Could not publish the template. Please try again."));
    }
  }

  async function loadTemplates() {
    try {
      const items = await oia().listTemplates();
      setTplList(items);
    } catch { setTplList([]); }
  }
  async function replaceCurrentScene(scene: SceneCanvas) {
    const c = fabricRef.current; if (!c) return;
    const history = [...undoStack.current];
    const list = pages.map((p, i) => i === activePage ? { ...p, canvas: scene } : p);
    setPages(list); await loadPage(activePage, list);
    undoStack.current = [...history, JSON.stringify(c.toObject())].slice(-40);
    setCanUndo(undoStack.current.length > 1); setHasScene(true);
  }
  function applyTemplate(t: Template) { return replaceCurrentScene(unmapAssetUrls(t.scene)); }
  async function uploadAsset(file: File) {
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const up = await oia().uploadAsset(file.name, bytes);
      setAssets((a) => [...a, up.url]); // canonical form; display mapping at insert
      await addImageLayer(up.url);
    } catch (e) {
      setNotice(bridgeErrorMessage(e, "The image could not be uploaded. Please try again."));
    }
  }
  /** AI-dock attach, upload without inserting; the image rides the NEXT edit request (TP.11). */
  async function attachAiRef(file: File) {
    setAiUploading(true);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const up = await oia().uploadAsset(file.name, bytes);
      setAiRefs((r) => [...r, up.url].slice(0, 4));
      setAssets((a) => (a.includes(up.url) ? a : [...a, up.url]));
    } catch (e) {
      setAiError({ message: bridgeErrorMessage(e, "The reference image could not be uploaded. Please try again.") });
    } finally {
      setAiUploading(false);
    }
  }
  async function addImageLayer(url: string) {
    const c = fabricRef.current; if (!c) return;
    const fabric = await import("fabric");
    const img = await fabric.FabricImage.fromURL(toDisplayUrl(url), { crossOrigin: "anonymous" });
    img.scaleToWidth((c.getWidth() / c.getZoom()) * 0.8);
    stampUser(img as unknown as import("@oia/schema").FabricObject); // TP.10: user upload, never wiped by refinement
    c.add(img); c.setActiveObject(img); c.requestRenderAll();
  }
  async function insertTable(n: number) {
    const c = fabricRef.current; if (!c) return;
    const fabric = await import("fabric");
    const w = c.getWidth() / c.getZoom(), h = c.getHeight() / c.getZoom();
    const W = w * 0.6, H = W * 0.6;
    const x0 = (w - W) / 2, y0 = (h - H) / 2;
    const objs: fabricNS.Object[] = [];
    for (let r = 0; r <= n; r++) objs.push(new fabric.Line([x0, y0 + (H / n) * r, x0 + W, y0 + (H / n) * r], { stroke: "#18181b", strokeWidth: 2 }));
    for (let col = 0; col <= n; col++) objs.push(new fabric.Line([x0 + (W / n) * col, y0, x0 + (W / n) * col, y0 + H], { stroke: "#18181b", strokeWidth: 2 }));
    const grid = new fabric.Group(objs, {});
    stampUser(grid as unknown as import("@oia/schema").FabricObject); // TP.10: user insert
    c.add(grid); c.setActiveObject(grid); c.requestRenderAll();
  }
  async function toggleDraw() {
    const c = fabricRef.current; if (!c) return;
    const { PencilBrush } = await import("fabric");
    c.freeDrawingBrush ??= new PencilBrush(c);
    c.freeDrawingBrush.width = 6; c.freeDrawingBrush.color = "#18181b";
    c.isDrawingMode = !c.isDrawingMode;
    setDrawing(c.isDrawingMode);
  }
  function togglePan() {
    const c = fabricRef.current; if (!c) return;
    setPanning((p) => {
      const next = !p;
      c.selection = !next; // selection off while panning
      c.forEachObject((obj) => { const background = (obj as fabricNS.Object & { name?: string }).name === "clip"; obj.selectable = !next && !background; obj.evented = !next && !background; });
      c.defaultCursor = next ? "grab" : "default";
      c.requestRenderAll();
      if (next) {
        let isDown = false, lastX = 0, lastY = 0;
        const onMouseDown = (e: { e: { clientX: number; clientY: number } }) => { isDown = true; lastX = e.e.clientX; lastY = e.e.clientY; };
        const onMouseMove = (e: { e: { clientX: number; clientY: number } }) => {
          if (!isDown) return;
          const vpt = c.viewportTransform;
          vpt[4] += e.e.clientX - lastX; vpt[5] += e.e.clientY - lastY;
          c.setViewportTransform(vpt);
          lastX = e.e.clientX; lastY = e.e.clientY;
        };
        const onMouseUp = () => { isDown = false; };
        c.on("mouse:down", onMouseDown as never);
        c.on("mouse:move", onMouseMove as never);
        c.on("mouse:up", onMouseUp as never);
        (c as unknown as { __panCleanup?: () => void }).__panCleanup = () => {
          c.off("mouse:down", onMouseDown as never); c.off("mouse:move", onMouseMove as never); c.off("mouse:up", onMouseUp as never);
        };
      } else {
        (c as unknown as { __panCleanup?: () => void }).__panCleanup?.();
      }
      return next;
    });
  }

  async function loadChats() {
    try { setChats(await oia().listSessions()); } catch { /* keep old list */ }
    setHistoryOpen((h) => !h);
  }
  /** A1 resume (spec goal 5): opening a conversation in the EDITOR loads its
   *  variants back into the tray and pins the session, the dock conversation
   *  continues where it left off. Home's resume (canvas view) is unchanged. */
  async function resumeConversationInDock(id: number) {
    try {
      const s = await oia().getSession(id);
      if (!s) return;
      setAiSessionId(id);
      setVariants(variantsFromSession(id, s.messages as Parameters<typeof variantsFromSession>[1]));
      setHiddenVariants(new Set());
      aiPromptByJobRef.current.clear();
      setAiTimeline([]);
      setAiNarrative([...(s.messages as { role: string; content?: string }[])].reverse().find((m) => m.role === "assistant")?.content ?? "");
      setHistoryOpen(false);
    } catch {
      setAiError({ message: "The conversation could not be opened. Please try again." });
    }
  }
  function mentionSelection() {
    const c = fabricRef.current; if (!c) return;
    const obj = c.getActiveObject() as (fabricNS.Object & { text?: string; src?: string; name?: string }) | undefined;
    if (!obj) { setAiPrompt((p) => `${p}@(select a layer on the canvas first) `); return; }
    const label = obj.type === "textbox" ? `"${(obj.text ?? "").slice(0, 40)}"` : obj.src ? `image: ${obj.name ?? "unnamed layer"}` : obj.type ?? "layer";
    setAiPrompt((p) => `${p}@(selected ${obj.type}: ${label}) `);
  }
  /** D21 split-layer: cut objects out of the selected image with the LOCAL SAM 3
   *  engine (no provider quota). Phases: ask → (models) → running → done. The
   *  original layer stays (SurgePix does the same), cutouts stack above it. */
  const [splitPhase, setSplitPhase] = useState<"ask" | "models" | "running" | null>(null);
  const [splitPrompt, setSplitPrompt] = useState("");
  const [splitModelNote, setSplitModelNote] = useState("");
  const splitTaskRef = useRef<string | null>(null);
  const splitRunRef = useRef(0);
  const splitStoppedRef = useRef(false);
  async function cancelSplit() {
    const id = splitTaskRef.current;
    if (id) await oia().cancelTask(id).catch(() => {});
    splitStoppedRef.current = true;
    setSplitPhase(null);
  }
  async function ensureSplitModels(): Promise<boolean> {
    const st = await oia().segmentStatus();
    if (st.state === "ready") return true;
    setSplitPhase("models");
    await oia().segmentDownload().catch(() => {});
    for (;;) {
      const s = await oia().segmentStatus();
      if (s.state === "ready") { setSplitPhase("ask"); return true; }
      if (s.state === "missing") { setSplitModelNote("The download did not finish. Check your connection and try again."); setSplitPhase(null); return false; }
      setSplitModelNote(`Downloading ${s.file} (${Math.round(s.downloadedBytes / 1e6)} of ${Math.round(s.totalBytes / 1e6)} MB)…`);
      await new Promise((r) => setTimeout(r, 800));
    }
  }
  async function runSplitLayer() {
    const c = fabricRef.current;
    const obj = c?.getActiveObject() as (fabricNS.FabricImage & { src?: string }) | undefined;
    if (!c || !obj || typeof obj.src !== "string" || splitPhase === "running") return;
    const prompt = splitPrompt.trim();
    if (!prompt) return;
    const myRun = ++splitRunRef.current;
    splitStoppedRef.current = false;
    setSplitPhase("running"); setNotice("");
    try {
      const fabric = await import("fabric");
      // export the selected image layer as PNG (exactly what the seller sees)
      const url = toDisplayUrl(toCanonicalUrl(obj.src));
      const imgEl = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("image load failed")); i.src = url; });
      const off = document.createElement("canvas");
      off.width = imgEl.naturalWidth; off.height = imgEl.naturalHeight;
      off.getContext("2d")!.drawImage(imgEl, 0, 0);
      const bytes = dataUrlBytes(off.toDataURL("image/png"));
      const up = await oia().uploadAsset("split.png", bytes);
      const started = await oia().submitTask("segment-image", { fileUrl: up.url, prompt });
      splitTaskRef.current = started.taskId;
      const final = await pollTask(started, { get: (id) => oia().getTask(id) });
      const objects = (final.taskResult?.objects ?? []) as { box: [number, number, number, number]; score: number; url: string }[];
      if (final.progress !== "succeeded") throw new Error(final.taskNote || final.msg || "the split failed");
      if (!objects.length) {
        if (splitRunRef.current !== myRun) return;
        setSplitPhase(null);
        setNotice(`Nothing matching "${prompt}" was found in this image. Try another word, like product, package or label.`);
        return;
      }
      // place each cutout at its box, fractions of the selected layer's on-page rect
      const rect = obj.getBoundingRect();
      const added: fabricNS.FabricImage[] = [];
      for (const o of objects) {
        const [fx1, fy1, fx2, fy2] = o.box;
        const w = (fx2 - fx1) * rect.width, h = (fy2 - fy1) * rect.height;
        if (w < 4 || h < 4) continue;
        const img = await fabric.FabricImage.fromURL(toDisplayUrl(o.url), { crossOrigin: "anonymous" });
        img.set({ left: rect.left + fx1 * rect.width, top: rect.top + fy1 * rect.height, scaleX: w / Math.max(1, img.width ?? 1), scaleY: h / Math.max(1, img.height ?? 1) });
        stampUser(img as unknown as import("@oia/schema").FabricObject);
        img.setCoords();
        c.add(img);
        added.push(img);
      }
      if (added.length > 1) { const sel = new fabric.ActiveSelection(added, { canvas: c }); c.setActiveObject(sel); }
      else if (added.length === 1) c.setActiveObject(added[0]);
      c.requestRenderAll();
      c.fire("object:modified", { target: obj });
      if (splitRunRef.current !== myRun) return;
      setSplitPhase(null);
      setNotice(splitStoppedRef.current
        ? `It finished after you stopped, the result was applied. ${added.length} layer${added.length === 1 ? "" : "s"} cut out; undo keeps the original.`
        : `${added.length} layer${added.length === 1 ? "" : "s"} cut out. The original image stays below; undo works as usual.`);
    } catch (e) {
      if (splitRunRef.current === myRun) {
        setSplitPhase(null);
        setNotice(bridgeErrorMessage(e, "The image could not be split. Please try again."));
      }
    } finally {
      splitTaskRef.current = null;
    }
  }
  /** SG-9: one-click Remove background on the selected image layer. Runs the
   *  EXISTING remove-background task (local rembg CLI, no provider quota), so
   *  the toolbar needs no new engine, only wiring. On failure the layer is
   *  NEVER touched: the seller keeps the original, with the honest reason. */
  const removeBgRunRef = useRef(0);
  const removeBgBusyRef = useRef(false);
  async function runRemoveBackground() {
    const c = fabricRef.current;
    const obj = c?.getActiveObject() as (fabricNS.FabricImage & { src?: string }) | undefined;
    if (!c || !obj || typeof obj.src !== "string" || removeBgBusyRef.current) return;
    const myRun = ++removeBgRunRef.current;
    removeBgBusyRef.current = true;
    setNotice("Removing the background, this can take a minute…");
    try {
      const url = toDisplayUrl(toCanonicalUrl(obj.src));
      const imgEl = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.crossOrigin = "anonymous"; i.onload = () => res(i); i.onerror = () => rej(new Error("image load failed")); i.src = url; });
      const off = document.createElement("canvas");
      off.width = imgEl.naturalWidth; off.height = imgEl.naturalHeight;
      off.getContext("2d")!.drawImage(imgEl, 0, 0);
      const bytes = dataUrlBytes(off.toDataURL("image/png"));
      const up = await oia().uploadAsset("remove-bg.png", bytes);
      const started = await oia().submitTask("remove-background", { fileUrl: up.url });
      const final = await pollTask(started, { get: (id) => oia().getTask(id) });
      const out = final.taskResult?.download;
      if (final.progress !== "succeeded" || !out) throw new Error(final.msg || final.taskNote || "the task failed");
      // replace in place, undo works through the normal object:modified history
      const boxW = (obj.width ?? 0) * (obj.scaleX ?? 1), boxH = (obj.height ?? 0) * (obj.scaleY ?? 1);
      await obj.setSrc(toDisplayUrl(out), { crossOrigin: "anonymous" });
      obj.set({ scaleX: boxW / Math.max(1, obj.width ?? 1), scaleY: boxH / Math.max(1, obj.height ?? 1) });
      stampUser(obj as unknown as import("@oia/schema").FabricObject);
      obj.setCoords();
      c.requestRenderAll();
      c.fire("object:modified", { target: obj });
      setAssets((a) => (a.includes(out) ? a : [...a, out]));
      if (myRun === removeBgRunRef.current) setNotice("Background removed. The cutout keeps its position; undo works as usual.");
    } catch (e) {
      if (myRun === removeBgRunRef.current) setNotice(bridgeErrorMessage(e, "The background could not be removed. Please try again."));
    } finally {
      removeBgBusyRef.current = false;
    }
  }
  /** ===== SG-8 crop: non-destructive clipPath crop on the selected image =====
   *  Marquee + 4 shade rects live on the canvas for the session only (never in
   *  scene JSON); Apply maps the marquee through the image's inverse matrix into
   *  a local clipPath Rect (crop.ts), so rotation and scale of the LAYER are
   *  respected and every export path picks the clip up for free. */
  interface CropSession {
    target: fabricNS.FabricImage & { src?: string };
    bounds: Rect;
    marquee: fabricNS.Rect;
    shades: fabricNS.Rect[];
    prev: { selectable: boolean; evented: boolean };
    onMoving: (e: { target?: fabricNS.Object }) => void;
    onScaling: (e: { target?: fabricNS.Object }) => void;
  }
  const [cropping, setCropping] = useState(false);
  const cropRef = useRef<CropSession | null>(null);
  /** Marquee geometry in scene coords; scaleX/Y stay 1 (scaling events normalize). */
  function marqueeRectOf(s: CropSession): Rect {
    const m = s.marquee;
    return {
      left: m.left,
      top: m.top,
      width: m.width * (m.scaleX ?? 1),
      height: m.height * (m.scaleY ?? 1),
    };
  }
  function syncCropShades(s: CropSession): void {
    const c = fabricRef.current;
    if (!c) return;
    const next = clampMarquee(marqueeRectOf(s), s.bounds, 8);
    s.marquee.set({ left: next.left, top: next.top, width: next.width, height: next.height, scaleX: 1, scaleY: 1 });
    s.marquee.setCoords();
    shadeRects(next, s.bounds).forEach((r, i) => {
      s.shades[i].set({ left: r.left, top: r.top, width: r.width, height: r.height });
      s.shades[i].setCoords();
    });
    c.requestRenderAll();
  }
  async function beginCrop() {
    const c = fabricRef.current;
    const obj = c?.getActiveObject() as CropSession["target"] | undefined;
    if (!c || !obj || typeof obj.src !== "string") return;
    const fabric = await import("fabric");
    const prev = { selectable: obj.selectable, evented: obj.evented };
    obj.set({ selectable: false, evented: false });
    c.discardActiveObject();
    const b = obj.getBoundingRect();
    const bounds: Rect = { left: b.left, top: b.top, width: b.width, height: b.height };
    const inset = { x: Math.max(8, bounds.width * 0.12), y: Math.max(8, bounds.height * 0.12) };
    const marquee = new fabric.Rect({
      ...clampMarquee({ left: bounds.left + inset.x, top: bounds.top + inset.y, width: bounds.width - inset.x * 2, height: bounds.height - inset.y * 2 }, bounds, 8),
      fill: "rgba(0,0,0,0)", stroke: "#7c3aed", strokeWidth: 2 / (c.viewportTransform?.[0] ?? 1), strokeDashArray: [6, 4],
      cornerColor: "#7c3aed", cornerStrokeColor: "#ffffff", transparentCorners: false, borderColor: "#7c3aed",
    });
    const shades = shadeRects({ left: marquee.left, top: marquee.top, width: marquee.width, height: marquee.height }, bounds).map((r) =>
      new fabric.Rect({ ...r, fill: "rgba(0,0,0,0.45)", selectable: false, evented: true, hasControls: false }));
    shades.forEach((s) => c.add(s));
    c.add(marquee);
    c.setActiveObject(marquee);
    const session: CropSession = {
      target: obj, bounds, marquee, shades, prev,
      onMoving: (e) => { if (e.target === marquee) syncCropShades(session); },
      onScaling: (e) => { if (e.target === marquee) syncCropShades(session); },
    };
    cropRef.current = session;
    c.on("object:moving", session.onMoving);
    c.on("object:scaling", session.onScaling);
    c.requestRenderAll();
    setCropping(true);
  }
  function teardownCrop(): CropSession | null {
    const s = cropRef.current;
    const c = fabricRef.current;
    if (!s || !c) return s;
    c.off("object:moving", s.onMoving);
    c.off("object:scaling", s.onScaling);
    c.remove(s.marquee, ...s.shades);
    s.target.set({ selectable: s.prev.selectable, evented: s.prev.evented });
    s.target.setCoords();
    c.requestRenderAll();
    cropRef.current = null;
    setCropping(false);
    return s;
  }
  async function applyCrop() {
    const s = teardownCrop();
    const c = fabricRef.current;
    if (!s || !c) return;
    const rect = clampMarquee(marqueeRectOf(s), s.bounds, 8);
    const clip = marqueeToClipRect(rect, s.target.calcTransformMatrix() as number[]);
    // zero-size only: sub-UNIT clips are legitimate (a paint-scaled 1x1 image
    // lives in a 0..1 local space, image-scales.ts)
    if (clip.width <= 0 || clip.height <= 0) return;
    const fabric = await import("fabric");
    const clipRect = new fabric.Rect({
      left: clip.left, top: clip.top, width: clip.width, height: clip.height,
      originX: "center", originY: "center", strokeWidth: 0, fill: "rgba(0,0,0,0)",
    });
    s.target.set("clipPath", clipRect);
    stampUser(s.target as unknown as import("@oia/schema").FabricObject);
    s.target.setCoords();
    c.setActiveObject(s.target);
    c.requestRenderAll();
    c.fire("object:modified", { target: s.target }); // undo/history/autosave see the clip
  }
  function cancelCrop() {
    teardownCrop();
  }

  /** R5 "Edit with AI": the AI tab opens with the selection already named in the prompt (A3 step one). */
  function editSelectionWithAi() {
    setAiOpen(true);
    setRightTab("ai");
    mentionSelection();
  }
  /** D16 poster-mode edit path: the copy is baked into the artwork, deconstruct
   *  THIS page (up to 1 image + 1 read) into a clean plate + native text layers.
   *  Mirrors the Workspace B1 flow (upload → task → poll), then swaps the page
   *  scene through replaceCurrentScene so undo/history/save all behave. */
  // teardown #2: one phase instead of two booleans (ask → running → null)
  const [textEditPhase, setTextEditPhase] = useState<"ask" | "running" | null>(null);
  const textEditTaskRef = useRef<string | null>(null);
  const textEditRunRef = useRef(0);
  const textEditStoppedRef = useRef(false);
  async function cancelTextEdit() {
    textEditStoppedRef.current = true; // Stop must block the next paid phase before IPC returns.
    const id = textEditTaskRef.current;
    if (id) await oia().cancelTask(id).catch(() => {});
    setTextEditPhase(null);
  }
  async function runMakeTextEditable() {
    const c = fabricRef.current;
    if (!c || textEditPhase === "running") return;
    const myRun = ++textEditRunRef.current;
    const size = sceneDimensions.current;
    textEditStoppedRef.current = false;
    setTextEditPhase("running"); setNotice("");
    try {
      // export the page as-is, the model reads exactly what the seller sees
      const dataUrl = c.toDataURL({ format: "png", multiplier: 1, enableRetinaScaling: false });
      const bytes = dataUrlBytes(dataUrl); // teardown #3: indexed loop, not the per-char callback path
      const up = await oia().uploadAsset("page.png", bytes);
      const started = await oia().submitTask("deconstruct", { fileUrl: up.url });
      textEditTaskRef.current = started.taskId;
      const final = await pollTask(started, { get: (id) => oia().getTask(id) });
      if (final.progress !== "succeeded" || !final.taskResult?.download) {
        throw new Error([final.msg, final.taskNote].filter(Boolean).join(" ") || "The page was not changed.");
      }
      const texts = (final.taskResult.texts ?? []) as DeconstructText[];
      const matched = await matchedDeconstructScene({ png: bytes, imageUrl: final.taskResult.download, w: size.width, h: size.height, texts }, oia(), {
        stopped: () => textEditStoppedRef.current || textEditRunRef.current !== myRun,
        onTask: (id) => { textEditTaskRef.current = id; },
      });
      await replaceCurrentScene(matched.scene);
      if (textEditRunRef.current !== myRun) return; // a newer run owns the UI
      setTextEditPhase(null);
      // honest notice: a Stop does not refund the read, if it finished anyway, say so (B7)
      setNotice(textEditStoppedRef.current
        ? `It finished after you stopped, the quota was already spent, so the result was applied. ${texts.length} text layer${texts.length === 1 ? "" : "s"}; undo keeps the original.`
        : `Text is editable, ${texts.length} text layer${texts.length === 1 ? "" : "s"} rebuilt. ${matched.note || "Undo works if you prefer the original."}`);
    } catch (e) {
      if (textEditRunRef.current === myRun) {
        setTextEditPhase(null);
        setNotice(bridgeErrorMessage(e, "The text could not be made editable. Please try again."));
      }
    } finally {
      textEditTaskRef.current = null;
      if (textEditRunRef.current === myRun) setTextEditPhase(null);
    }
  }
  /** R5 Replace image: new pixels, same box on the page; the swapped layer becomes the user's (TP.10). */
  async function replaceSelectedImage(file: File) {
    const c = fabricRef.current;
    const obj = c?.getActiveObject() as (fabricNS.FabricImage & { src?: string }) | undefined;
    if (!c || !obj || typeof obj.src !== "string") return;
    try {
      const up = await oia().uploadAsset(file.name, new Uint8Array(await file.arrayBuffer()));
      const boxW = (obj.width ?? 0) * (obj.scaleX ?? 1), boxH = (obj.height ?? 0) * (obj.scaleY ?? 1);
      await obj.setSrc(toDisplayUrl(up.url), { crossOrigin: "anonymous" });
      obj.set({ scaleX: boxW / Math.max(1, obj.width ?? 1), scaleY: boxH / Math.max(1, obj.height ?? 1) });
      stampUser(obj as unknown as import("@oia/schema").FabricObject);
      obj.setCoords();
      c.requestRenderAll();
      c.fire("object:modified", { target: obj });
      setAssets((a) => (a.includes(up.url) ? a : [...a, up.url]));
    } catch (e) {
      setNotice(bridgeErrorMessage(e, "The image could not be replaced. Please try again."));
    }
  }
  async function duplicateSelection() {
    const { duplicateSelected } = await import("@oia/canvas");
    callCanvas((c) => duplicateSelected(c));
  }

  async function runAiEdit() {
    if (aiBusy || !aiPrompt.trim()) return;
    const c = fabricRef.current;
    const scene = c?.toObject() as SceneCanvas | undefined;
    // A3-lite (selection-bound edit), hardened by the 2026-11-02 live experiment:
    // sending the whole ref set made the image model repaint the FLATTEST reference
    // (it invented sale text into a clean plate). The edit target must be the ONLY
    // image the model can act on: selected image layer → that image alone; no image
    // selection → the flattened page (what the seller sees) leads as before.
    const active = c?.getActiveObject() as (fabricNS.Object & { src?: string; name?: string }) | undefined;
    // teardown #1: the live selection leads, but if fabric dropped it mid-flow the
    // LAST image the user picked still targets the edit (resolveEditTarget ignores stale names)
    const target = resolveEditTarget(active, (scene?.objects ?? []) as { src?: string; name?: string }[], aiLastImageRef.current);
    const activeSrc = target ? toCanonicalUrl(target.src) : null;
    const hasText = (scene?.objects ?? []).some((o) => o.type === "Textbox");
    let refs: string[] | undefined;
    if (refCapable) {
      if (activeSrc) {
        refs = [activeSrc, ...aiRefs].slice(0, 4); // the target, plus anything explicitly attached
      } else {
        const canvasRefs = (scene?.objects ?? [])
          .map((o) => (typeof o.src === "string" ? toCanonicalUrl(o.src) : null))
          .filter((u): u is string => u !== null);
        refs = [...aiRefs, ...canvasRefs].slice(0, 4);
      }
    }
    // A3-lite: the edit contract is STRUCTURED now, referenceImages[0] is the
    // target; the agent layer welds the clauses (target declaration, dimension
    // lock, lettering ban). The renderer no longer concatenates prose.
    const aiTargetName = target?.name;
    const editMode = { ...(aiTargetName ? { targetName: aiTargetName } : {}), ...(hasText ? { textLayerOverlays: true } : {}) };
    aiTargetRef.current = aiTargetName ?? null;
    await dispatchAiEdit(aiPrompt, refs, editMode);
  }

  /** Shared send path for every AI edit (plain + ME markup), busy state, session
   *  pinning, error surface and the event subscription all behave identically. */
  async function dispatchAiEdit(prompt: string, refs: string[] | undefined, editMode: Record<string, unknown>) {
    setAiBusy(true); setAiTimeline([]); setAiNarrative(""); setAiError(null); aiJobRef.current = null;
    try {
      // VA-1: pin the conversation, variants and the A5 plan stash attach to ONE session
      const res = await oia().chatRun({ prompt, ...(aiSessionId ? { sessionId: aiSessionId } : {}), ...(refs?.length ? { referenceImages: refs } : {}), editMode: editMode as ChatRequest["editMode"] });
      setAiSessionId(res.sessionId);
      // events stream in through the onChatEvent subscription; wait for the job to settle
      await res;
    } catch (e) {
      setAiError({ message: bridgeErrorMessage(e, "Something went wrong. Please try again.") });
    } finally { setAiBusy(false); }
  }
  /** TP.5: cancel API only; the terminal cancelled event arrives on the subscription. */
  async function stopAiEdit() {
    if (aiJobRef.current) await oia().cancelChat(aiJobRef.current).catch(() => {});
  }

  // ===== ME, markup edit "Circle to edit" (markup-edit.md, flatten mode) =====
  // Strokes live in the layer's NATURAL pixel space (markup-annotate.ts) so pan/
  // zoom never distorts them; the object is interaction-locked for the session so
  // the captured object matrix stays valid. Nothing here ever enters the scene
  // JSON, the annotation is composited onto a throwaway copy for the edit call.
  interface MarkupSession {
    phase: "draw" | "ask";
    src: string;
    name?: string;
    objW: number;
    objH: number;
    natW: number;
    natH: number;
    objectMatrix: number[];
    restore: () => void;
  }
  const [markup, setMarkup] = useState<MarkupSession | null>(null);
  const markupRef = useRef<MarkupSession | null>(null);
  useEffect(() => { markupRef.current = markup; }, [markup]);
  const [markupPrompt, setMarkupPrompt] = useState("");
  const [markupStrokeCount, setMarkupStrokeCount] = useState(0);
  const markupStrokesRef = useRef<Stroke[]>([]);
  const markupOverlayRef = useRef<HTMLCanvasElement | null>(null);
  const markupLiveRef = useRef<Stroke | null>(null);

  function beginMarkupEdit() {
    const c = fabricRef.current;
    // SAFETY: fabric.Image carries getElement/skew; the cast names exactly those.
    const active = c?.getActiveObject() as (fabricNS.Object & { src?: string; name?: string; skewX?: number; skewY?: number; getElement?: () => HTMLImageElement }) | undefined;
    if (!c || !active || !active.src) return;
    if ((active.skewX ?? 0) !== 0 || (active.skewY ?? 0) !== 0) {
      setAiError({ message: "Straighten the layer first, skewed layers cannot be circled accurately." });
      return;
    }
    const el = active.getElement?.();
    const prev = { selectable: active.selectable, evented: active.evented };
    active.set({ selectable: false, evented: false });
    c.discardActiveObject();
    c.requestRenderAll();
    markupStrokesRef.current = [];
    markupLiveRef.current = null;
    setMarkupPrompt("");
    setMarkupStrokeCount(0);
    setMarkup({
      phase: "draw",
      // DISPLAY form (oia://…), what the renderer can actually load for the composite;
      // the composite itself goes to the wire as a data: URL, so canonical form never matters here.
      src: toDisplayUrl(active.src),
      name: active.name,
      objW: active.width,
      objH: active.height,
      natW: el?.naturalWidth || active.width,
      natH: el?.naturalHeight || active.height,
      objectMatrix: active.calcTransformMatrix() as number[],
      restore: () => { active.set({ selectable: prev.selectable, evented: prev.evented }); c.requestRenderAll(); },
    });
  }

  function endMarkupEdit() {
    markupRef.current?.restore();
    markupStrokesRef.current = [];
    markupLiveRef.current = null;
    setMarkup(null);
    setMarkupStrokeCount(0);
  }

  /** Screen point → natural px for the captured session (viewport-relative to the
   *  fabric lower canvas, exactly what viewportToNatural expects). */
  function markupPoint(clientX: number, clientY: number): { x: number; y: number } | null {
    const c = fabricRef.current;
    const m = markupRef.current;
    if (!c || !m) return null;
    const rect = c.lowerCanvasEl.getBoundingClientRect();
    return viewportToNatural(
      { x: clientX - rect.left, y: clientY - rect.top },
      c.viewportTransform as number[],
      m.objectMatrix,
      m.objW,
      m.objH,
      m.natW,
      m.natH,
    );
  }

  async function runMarkupEdit() {
    const m = markupRef.current;
    if (!m || aiBusy || !markupPrompt.trim() || !markupStrokesRef.current.length) return;
    let composite: string;
    try {
      composite = await markupComposite(m.src, markupStrokesRef.current, m.natW, m.natH);
    } catch {
      setAiError({ message: "Could not prepare the circled image. Try again." });
      return;
    }
    const prompt = markupPrompt;
    const name = m.name;
    endMarkupEdit();
    setAiOpen(true);
    setRightTab("ai");
    // No textLayerOverlays here: a markup edit may legitimately rewrite baked copy
    // (probe P3 changed a price), the marker clause + dimension lock carry the contract.
    await dispatchAiEdit(prompt, refCapable ? [composite, ...aiRefs].slice(0, 4) : undefined, {
      ...(name ? { targetName: name } : {}),
      markup: "flatten",
    });
  }

  // Redraw the annotation every frame while drawing, pan/zoom mid-session stays
  // correct because strokes project back from natural px each frame.
  useEffect(() => {
    if (markup?.phase !== "draw") return;
    let raf = 0;
    const draw = () => {
      const ov = markupOverlayRef.current;
      const c = fabricRef.current;
      const m = markupRef.current;
      if (ov && c && m) {
        const rect = ov.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        if (ov.width !== Math.round(rect.width * dpr) || ov.height !== Math.round(rect.height * dpr)) {
          ov.width = Math.round(rect.width * dpr);
          ov.height = Math.round(rect.height * dpr);
        }
        const ctx = ov.getContext("2d");
        if (ctx) {
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          ctx.clearRect(0, 0, rect.width, rect.height);
          const vpt = c.viewportTransform as number[];
          const toVp = (n: { x: number; y: number }) => naturalToViewport(n, vpt, m.objectMatrix, m.objW, m.objH, m.natW, m.natH);
          ctx.strokeStyle = "#ff0000";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";
          ctx.lineWidth = Math.max(1.5, 0.015 * Math.min(m.objW, m.objH) * vpt[0]);
          const all = [...markupStrokesRef.current, ...(markupLiveRef.current ? [markupLiveRef.current] : [])];
          for (const s of all) {
            if (s.length === 1) {
              const p = toVp(s[0]);
              ctx.beginPath();
              ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
              ctx.fillStyle = "#ff0000";
              ctx.fill();
              continue;
            }
            ctx.beginPath();
            const p0 = toVp(s[0]);
            ctx.moveTo(p0.x, p0.y);
            for (let i = 1; i < s.length; i++) { const p = toVp(s[i]); ctx.lineTo(p.x, p.y); }
            ctx.stroke();
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [markup?.phase]);

  // Esc exits the markup session without sending anything (0 quota).
  useEffect(() => {
    if (!markup) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") endMarkupEdit(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [markup]);

  /** VA-4: swap the SELECTED image layer's src for the variant's artwork. Geometry,
   * every other layer, and the page envelope stay untouched; undo works (history
   * push happens in replaceCurrentScene). */
  async function applyVariantToSelection(v: VariantCard) {
    const c = fabricRef.current;
    const artwork = variantArtworkObject(v.canvas);
    if (!c) return;
    if (!artwork) {
      setAiError({ message: "This variant has no artwork image to apply." });
      return;
    }
    const active = c.getActiveObject() as (fabricNS.Object & { src?: string; name?: string }) | undefined;
    if (!active || typeof active.src !== "string") {
      setAiError({ message: "Select an image layer on the canvas first, then replace it." });
      return;
    }
    // A3-lite TOCTOU: a variant painted for one layer never replaces another,
    // even if the button state raced a selection change mid-click.
    const gate = canReplaceVariant(v, { selectedImg: true, selectedName: (active.name as string | undefined) ?? null });
    if (!gate.ok) {
      setAiError({ message: `${gate.why}. This variant was painted for a different layer.` });
      return;
    }
    const idx = c.getObjects().indexOf(active);
    if (idx < 0) return; // active object already detached, nothing honest to replace
    try {
      const next = replaceObjectSrc(unmapAssetUrls(c.toObject() as SceneCanvas), idx, artwork.src);
      await replaceCurrentScene(mapAssetUrls(next));
      // honest UI: keeping the layer's geometry means a differently-proportioned
      // artwork is STRETCHED into it, say so instead of letting the user discover it
      const tw = (active.width ?? 0) * (active.scaleX ?? 1);
      const th = (active.height ?? 0) * (active.scaleY ?? 1);
      if (artwork.aspect > 0 && tw > 0 && th > 0) {
        const delta = Math.abs(artwork.aspect - tw / th) / (tw / th);
        if (delta > ASPECT_TOLERANCE) setNotice("The new artwork has a different aspect ratio, it was stretched to fit the selected layer. Undo works if you prefer the original.");
      }
    } catch (err) {
      // never swallow silently, the oia:// poisoned-realpath bug hid for hours behind a mute catch
      console.error("[editor] variant replace failed:", err instanceof Error ? err.message : String(err));
      setAiError({ message: "The layer could not be replaced. Select the image layer again and retry." });
    }
  }

  /** VA goal 4, the variant becomes its own project (mirror of Home's openInEditor). */
  async function openVariantProject(v: VariantCard) {
    try {
      const p = await oia().createProject({ name: `${projectName || "Variant"}, variant`, scene: v.canvas });
      onOpenProject(p.id);
    } catch (e) {
      setAiError({ message: bridgeErrorMessage(e, "The editor could not be opened. Please try again.") });
    }
  }

  async function addText(kind: TextPreset) {
    const { addTextPreset } = await import("@oia/canvas");
    callCanvas((c) => addTextPreset(c, kind, fontStack()));
  }
  async function addShape(kind: ShapeKind) {
    const { addShape } = await import("@oia/canvas");
    callCanvas((c) => addShape(c, kind));
  }
  async function applyPreset(name: SizePresetName) {
    const { applySizePreset } = await import("@oia/canvas");
    const c = fabricRef.current; if (!c) return;
    applySizePreset(c, name);
    const dims = SIZE_PRESETS[name];
    setCustomW(dims.width); setCustomH(dims.height);
    sceneDimensions.current = dims; fitView(); scheduleSave();
  }
  async function applyCustom(w: number, h: number) {
    const { resizeCanvas } = await import("@oia/canvas");
    const c = fabricRef.current; if (!c) return;
    resizeCanvas(c, w, h);
    sceneDimensions.current = { width: w, height: h }; fitView(); scheduleSave();
  }
  async function patchText(patch: Parameters<typeof import("@oia/canvas").patchSelectedText>[1]) {
    const { patchSelectedText } = await import("@oia/canvas");
    callCanvas((c) => patchSelectedText(c, patch));
    scheduleSave();
  }

  async function doExport() {
    const c = fabricRef.current; if (!c) return;
    setExporting(true);
    try {
      const plan = planExport(exportFormat, exportScope, Math.max(1, pages.length), projectName);

      const snap = snapshotActive();
      const list = (snap ? pages.map((p, i) => (i === activePage ? snap : p)) : pages).slice();
      if (list.length === 0) list.push({ id: "page_1", canvas: blankScene(customW, customH) });
      const exportList = plan.scope === "all" ? list : [list[activePage] ?? list[0]];

      // Export on an isolated canvas: never mutate the active page, its history, or autosave
      const { StaticCanvas } = await import("fabric");
      const renderer = new StaticCanvas(document.createElement("canvas"), { renderOnAddRemove: false });
      const images: { jpg: string; png: string; width: number; height: number }[] = [];
      try {
        await document.fonts.ready;
        for (const page of exportList) {
          const size = sceneSize(page.canvas);
          await renderer.loadFromJSON(mapAssetUrls(page.canvas));
          renderer.setDimensions(size);
          normalizeImageScales(renderer); // exported PNG must fill the box too
          renderer.getObjects().forEach(o => { if ("fontFamily" in o && o.fontFamily === "Be Vietnam Pro") o.set("fontFamily" as never, fontStack() as never); });
          renderer.renderAll();
          images.push({ ...size, jpg: renderer.toDataURL({ format: "jpeg", quality: plan.defaultQuality, multiplier: 1 }), png: renderer.toDataURL({ format: "png", multiplier: 1 }) });
        }
      } finally { await renderer.dispose(); }

      let blob: Blob | null = null;
      if (plan.strategy === "canvas-dataurl") {
        blob = dataUrlToBlob(plan.format === "png" ? images[0].png : images[0].jpg);
      } else if (plan.strategy === "jspdf") {
        const { jsPDF } = await import("jspdf");
        const dims = images[0];
        const pdf = new jsPDF({ orientation: dims.width > dims.height ? "landscape" : "portrait", unit: "px", hotfixes: ["px_scaling"], format: [dims.width, dims.height] });
        images.forEach((im, i) => {
          if (i > 0) pdf.addPage([im.width, im.height], im.width > im.height ? "landscape" : "portrait");
          pdf.addImage(im.jpg, "JPEG", 0, 0, im.width, im.height);
        });
        blob = pdf.output("blob");
      } else if (plan.strategy === "pptxgenjs") {
        const pptx = await makePptx(images, images[0]);
        blob = (await pptx.write({ outputType: "blob" })) as Blob;
      } else if (plan.strategy === "jszip") {
        const { default: JSZip } = await import("jszip");
        const zip = new JSZip();
        const folder = zip.folder(plan.fileName.replace(/\.zip$/, ""));
        images.forEach((im, i) => {
          const single = plan.format === "png" ? im.png : im.jpg;
          folder?.file(`${i + 1}.${plan.format === "zip" ? "jpg" : plan.format}`, dataUrlToBlob(single));
        });
        blob = await zip.generateAsync({ type: "blob" });
      }

      if (blob) {
        const res = await oia().saveExport(plan.fileName, new Uint8Array(await blob.arrayBuffer()));
        setNotice(res.saved && res.path ? `Saved: ${res.path}` : "Save cancelled.");
      }
    } catch (e) {
      setNotice(bridgeErrorMessage(e, "Export failed. Check that all image files are available and try again."));
    } finally {
      setExporting(false);
      setExportOpen(false);
    }
  }

  useEffect(() => {
    if (rightTab === "ai") setVariantsSeen(variants.filter((v) => !hiddenVariants.has(v.id)).length);
  }, [rightTab, variants, hiddenVariants]);

  const toolLabels: Record<Panel, string> = { templates: "Templates", assets: "Uploads", text: "Text", shapes: "Shapes", tables: "Tables", draw: "Draw", layers: "Layers", page: "Page" };
  const newVariants = variants.filter((v) => !hiddenVariants.has(v.id)).length - variantsSeen;
  const shapeLabels: Record<ShapeKind, string> = useMemo(() => ({
    circle: "◯", rectRounded: "▢", rect: "□", triangleUp: "△", triangleDown: "▽",
    diamond: "◇", line: "—", lineDotted: "┄", arrowRight: "→",
  }), []);

  return (
    <main className="edRoot" data-testid="editor-root">
      {/* Top bar */}
      <div className="edTop">
        <button className="iconBtn" onClick={onExit} aria-label="Back to Home"><I d={icons.back} /></button>
        <span className="wordmark" style={{ fontSize: 19, marginRight: 12 }}>O<span>ia</span></span>
        <input className="nameInput" aria-label="Project name" value={projectName} onChange={(e) => { setProjectName(e.target.value); }} onBlur={scheduleSave} />
        <button className="iconBtn" onClick={undo} disabled={!canUndo} title="Undo" aria-label="Undo"><I d={icons.undo} /></button>
        <button className="iconBtn" onClick={redoOp} disabled={!canRedo} title="Redo" aria-label="Redo"><I d={icons.redo} /></button>
        <span className="saveStatus">
          <I d={icons.cloud} size={12} /> {saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : savedAt ? `Saved ${savedAt.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "Saved"}
        </span>
        <span className="spacer" />
        <button className="iconBtn labeledIcon" aria-label="Toggle side panel" title="Design and AI panel" onClick={() => setAiOpen(!aiOpen)} aria-pressed={aiOpen}><I d={icons.spark} size={15} /><span>Panel</span></button>
        <div className="shareWrap">
          <button className="secondaryBtn" aria-haspopup="menu" aria-expanded={shareOpen} onClick={() => setShareOpen((v) => !v)}>Share ▾</button>
          {shareOpen && (
            <>
              <button className="menuScrim" aria-label="Close menu" tabIndex={-1} onClick={() => setShareOpen(false)} />
              <div className="shareMenu" role="menu">
                <button role="menuitem" onClick={() => { setShareOpen(false); void publishTemplate(); }}>
                  <strong>Publish as template</strong><span>Adds this page to your template library</span>
                </button>
              </div>
            </>
          )}
        </div>
        <button className="primaryBtn" style={{ display: "flex", alignItems: "center", gap: 5 }} onClick={() => setExportOpen(true)}>
          <I d={icons.download} size={14} /> Export
        </button>
      </div>

      {notice && <div className="notice" role="status" style={{ margin: 0, borderRadius: 0, display: "flex", justifyContent: "space-between", padding: "6px 16px" }}>{notice}<button className="iconBtn" aria-label="Dismiss notice" onClick={() => setNotice("")}><I d={icons.x} size={13} /></button></div>}
      <div className="edBody">
        {/* Left rail */}
        <nav className="rail" aria-label="Editor tools">
          {RAIL.map((p) => (
            <button key={p} className={panel === p ? "railBtn active" : "railBtn"} onClick={() => setPanel(panel === p ? null : p)} aria-pressed={panel === p} aria-label={toolLabels[p]}>
              <PanelIcon p={p} />
              <span>{toolLabels[p]}</span>
            </button>
          ))}
        </nav>

        {/* Panel content */}
        {panel && <aside className="panelBox">
          <div className="sectionHeading" style={{ marginBottom: 16 }}><strong style={{ fontSize: 13 }}>{toolLabels[panel]}</strong><button className="iconBtn" aria-label="Close tool panel" onClick={() => setPanel(null)}><I d={icons.x} size={15} /></button></div>
          {panel === "text" && (
            <>
              <h4>Text</h4>
              <p className="hintP">Add text to your canvas</p>
              {(["textbox", "heading", "subheading", "paragraph"] as TextPreset[]).map((k) => (
                <button key={k} className="presetBtn" onClick={() => addText(k)}
                  style={{ fontWeight: TEXT_PRESET_SPECS[k].fontWeight, fontSize: k === "heading" ? 20 : k === "subheading" ? 16 : 13 }}>
                  {TEXT_PRESET_SPECS[k].label}
                </button>
              ))}
            </>
          )}
          {panel === "shapes" && (
            <>
              <h4>Shapes</h4>
              <p className="hintP">Add shapes to your canvas</p>
              <div className="shapeGrid">
                {SHAPES.map((s) => (
                  <button key={s} className="shapeBtn" title={s} onClick={() => addShape(s)}>{shapeLabels[s]}</button>
                ))}
              </div>
            </>
          )}
          {panel === "layers" && <LayersPanel canvas={canvas} />}
          {panel === "page" && (
            <>
              <h4>Page</h4>
              <p className="hintP">Marketplace sizes follow each seller center's current guide</p>
              <label>Background color</label>
              <input type="color" defaultValue="#ffffff" aria-label="Background color" onChange={(e) => callCanvas((c) => { c.backgroundColor = e.target.value; c.requestRenderAll(); })} />
              <label>Custom size (px)</label>
              <div className="sizeRow">
                <input type="number" aria-label="Artboard width" value={customW} onChange={(e) => { const w = Number(e.target.value) || 1; setCustomW(w); const r = resizeWithLock({ width: customW, height: customH }, { width: w }); setCustomH(r.height); applyCustom(r.width, r.height); }} />
                <span>×</span>
                <input type="number" aria-label="Artboard height" value={customH} onChange={(e) => { const h = Number(e.target.value) || 1; setCustomH(h); const r = resizeWithLock({ width: customW, height: customH }, { height: h }); setCustomW(r.width); applyCustom(r.width, r.height); }} />
              </div>
              <label>Recommended size</label>
              {(Object.keys(SIZE_PRESETS) as SizePresetName[]).map((name) => (
                <button key={name} className="presetBtn small" onClick={() => applyPreset(name)}>
                  {name} <em>{SIZE_PRESETS[name].width} × {SIZE_PRESETS[name].height}</em>
                </button>
              ))}
              <button className="primaryBtn wide" style={{ marginTop: 8 }} onClick={async () => {
                const snap = snapshotActive();
                const list = (snap ? pages.map((p, i) => (i === activePage ? snap : p)) : pages);
                const applied = applySizeToAllPages(list, customW, customH);
                setPages(applied);
                await loadPage(activePage, applied);
                scheduleSave();
              }}>Apply size to all pages</button>
            </>
          )}
          {panel === "templates" && (
            <>
              <h4>Templates</h4>
              <p className="hintP">Choose a template for the current page.</p>
              <h5 className="tplGroup">Livestream</h5>
              {LIVESTREAM_TEMPLATES.map((tpl) => (
                <button key={tpl.id} className="presetBtn small" onClick={() => applyTemplate(tpl)}>
                  {tpl.name}
                </button>
              ))}
              <h5 className="tplGroup">Studio templates</h5>
              {STUDIO_TEMPLATES.map((tpl) => (
                <button key={tpl.id} className="presetBtn small" onClick={() => applyTemplate(tpl)}>
                  {tpl.name}
                </button>
              ))}
              <h5 className="tplGroup">Your library</h5>
              <button className="presetBtn small" onClick={loadTemplates}>Load your library</button>
              {tplList.map((tpl) => (
                <button key={tpl.id} className="presetBtn small" onClick={() => applyTemplate(tpl)}>
                  {tpl.name} <em> {tpl.tipCredits}</em>
                </button>
              ))}
            </>
          )}
          {panel === "assets" && (
            <>
              <h4>Uploads</h4>
              <p className="hintP">Add your product photos, then select one to place it on the canvas.</p>
              <label className="presetBtn small" style={{ cursor: "pointer" }}>
                Upload image
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && uploadAsset(e.target.files[0])} />
              </label>
              {assets.map((u) => (
                <button key={u} className="presetBtn small" onClick={() => addImageLayer(u)} title={u}> Uploaded image</button>
              ))}
            </>
          )}
          {panel === "tables" && (
            <>
              <h4>Tables</h4>
              <p className="hintP">Add a simple table to your design.</p>
              {[2, 3, 4].map((n) => (
                <button key={n} className="presetBtn small" onClick={() => insertTable(n)}>{n} × {n}</button>
              ))}
            </>
          )}
          {panel === "draw" && (
            <>
              <h4>Draw</h4>
              <p className="hintP">Draw freehand on your canvas.</p>
              <button className="presetBtn small" onClick={toggleDraw}>{drawing ? "Stop drawing" : "Start drawing"}</button>
            </>
          )}
        </aside>}

        {/* AI dock, its own column; never overlaps the document */}
        {aiOpen && (
          <aside className="aiPanelFloating" data-testid="ai-dock">
            <div className="aiPanelHeader">
              <div className="panelTabs" role="tablist" aria-label="Side panel">
                <button role="tab" aria-selected={rightTab === "design"} className={rightTab === "design" ? "active" : ""} data-testid="tab-design" onClick={() => setRightTab("design")}>Design</button>
                <button role="tab" aria-selected={rightTab === "ai"} className={rightTab === "ai" ? "active" : ""} data-testid="tab-ai" onClick={() => setRightTab("ai")}>
                  AI{rightTab === "design" && newVariants > 0 && <span className="tabBadge" aria-label={`${newVariants} new variants`}>{newVariants}</span>}
                </button>
              </div>
              <span className="spacer" />
              {rightTab === "ai" && <button className="iconBtn" aria-label="New conversation" onClick={() => { setAiTimeline([]); setAiNarrative(""); setAiPrompt(""); setVariants([]); setHiddenVariants(new Set()); setAiSessionId(null); aiPromptByJobRef.current.clear(); }}><I d={icons.plus} size={16} /></button>
              }{rightTab === "ai" && <button className="iconBtn" aria-label="Conversation history" onClick={loadChats}><I d={icons.history} size={16} /></button>}
              <button className="iconBtn" aria-label="Close side panel" onClick={() => setAiOpen(false)}><I d={icons.x} size={16} /></button>
            </div>
            {rightTab === "design" ? (
              <Inspector
                canvas={canvas}
                page={{ w: customW, h: customH }}
                onOpenPage={() => setPanel("page")}
                onEditWithAi={editSelectionWithAi}
                onReplaceImage={(f) => void replaceSelectedImage(f)}
              />
            ) : (
              <>
              {!aiNarrative && !aiTimeline.length && <div className="aiPanelEmpty"><h3>What would you like to refine?</h3><p>{hasTextLayer ? "Change colors, edit copy, or explore a different layout. Select a layer for a more precise edit." : "The copy is baked into the artwork: ask for a repaint with your changes and the style stays."}</p>{(hasTextLayer
                ? [{ label: "Try a softer color palette", prompt: "Try a softer color palette" }, { label: "Make the headline stand out", prompt: "Make the headline stand out" }]
                : [{ label: "Change the text", prompt: "change the text: " }, { label: "New background, same drinks and text", prompt: "make the background " }]
              ).map((s) => <button key={s.label} className="aiSuggestion" onClick={() => setAiPrompt(s.prompt)}>{s.label}</button>)}</div>}
              {historyOpen && (
                <div style={{ maxHeight: 140, overflowY: "auto", borderBottom: "1px solid var(--line)", marginBottom: 8 }}>
                  {chats.map((c) => (
                    <div key={c.id} className="presetBtn small" style={{ cursor: "pointer" }} onClick={() => void resumeConversationInDock(c.id)}>{c.name}</div>
                  ))}
                  {chats.length === 0 && <p className="hintP">No conversations yet.</p>}
                </div>
              )}
              {aiTimeline.length > 0 && <RunSteps steps={stepsFromTimeline(aiTimeline)} />}
              {aiError && <div role="alert" className="notice error" style={{ margin: "8px 0", fontSize: 12 }}>{aiError.message}</div>}
              {aiNarrative && <div className="narrative" style={{ marginTop: 8, maxHeight: 200, overflowY: "auto" }}>{aiNarrative}</div>}
              {/* A1 preview-apply, newest first; "Not now" only hides (VA-7), the
                  session record keeps every canvas (G5). */}
              {variants.some((v) => !hiddenVariants.has(v.id)) && (
                <div className="variantTray" data-testid="variant-tray" aria-label="Variants">
                  {[...variants].reverse().filter((v) => !hiddenVariants.has(v.id)).map((v) => {
                    const artwork = variantArtworkObject(v.canvas);
                    const gate = canReplaceVariant(v, { selectedImg, selectedName });
                    const canReplace = Boolean(artwork) && gate.ok;
                    const why = !artwork ? "This variant has no artwork image" : gate.why;
                    return (
                      <div key={v.id} className="variantCard" data-testid="variant-card" aria-label={`Variant: ${v.prompt.slice(0, 60) || "untitled edit"}`}>
                        <div className="variantThumb">
                          {v.thumbnail ? <img src={toDisplayUrl(v.thumbnail)} alt="" /> : <ScenePreview scene={v.canvas} label="Variant" />}
                        </div>
                        <div className="variantMeta">
                          <span className="variantPrompt">{v.prompt.slice(0, 90) || "Variant"}</span>
                          <div className="variantActions">
                            <button className="primaryBtn small" data-testid="variant-replace" disabled={!canReplace} title={why || "Replace the selected image layer with this variant"} onClick={() => void applyVariantToSelection(v)}>Replace selected layer</button>
                            <button data-testid="variant-open" onClick={() => void openVariantProject(v)}>Open in editor</button>
                            <button data-testid="variant-dismiss" onClick={() => setHiddenVariants((h) => { const n = new Set(h); n.add(v.id); return n; })}>Not now</button>
                          </div>
                          {artwork && !gate.ok && <span className="variantWhy">{gate.why}</span>}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
              <div className="aiComposer">
                {aiRefs.length > 0 && (
                  <div className="attachmentList" style={{ paddingTop: 0, paddingBottom: 8 }}>
                    {aiRefs.map((u, i) => (
                      <div key={u} className="attachment">
                        <img src={toDisplayUrl(u)} alt={`Reference ${i + 1}`} />
                        <button className="iconBtn" aria-label={`Remove reference image ${i + 1}`} onClick={() => setAiRefs((r) => r.filter((x) => x !== u))}><I d={icons.x} size={11} /></button>
                      </div>
                    ))}
                  </div>
                )}
                <textarea aria-label="AI edit request" value={aiPrompt} rows={3} placeholder="Describe the changes you have in mind…" onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void runAiEdit(); } }} />
                <div className="aiComposerControls">
                  <button className="iconBtn" title="Attach a reference image" aria-label="Attach a reference image" disabled={aiUploading || !refCapable} onClick={() => aiFileRef.current?.click()}><I d={icons.paperclip} size={16} /></button>
                  <input ref={aiFileRef} aria-label="AI reference image file" type="file" accept="image/*" hidden onChange={(e) => { if (e.target.files?.[0]) void attachAiRef(e.target.files[0]); e.target.value = ""; }} />
                  <button className="iconBtn" title="Use selected layer" aria-label="Mention selected layer" onClick={mentionSelection}>@</button><span className="hintP" style={{ fontSize: 10, margin: 0 }}>Layer by layer</span>{!imageMock && !aiBusy && <span className="hintP" data-testid="cost-hint" style={{ fontSize: 10, margin: 0 }} title="Each edit generates one image with your provider">≈ 1 image</span>}{aiBusy
                  ? <button className="generateBtn" style={{ background: "#dc2626" }} onClick={stopAiEdit} aria-label={STOP_LABEL} title={STOP_LABEL}><span style={{ width: 12, height: 12, background: "#fff", display: "inline-block" }} /></button>
                  : <button className="generateBtn" disabled={aiBusy || !aiPrompt.trim()} onClick={runAiEdit} aria-label={aiBusy ? "Editing" : "Send edit request"}><I d={icons.up} /></button>}</div>
              </div>
              </>
            )}
          </aside>
        )}
        {/* Canvas */}
        <section className="canvasArea" ref={canvasAreaRef} aria-label="Design workspace">
          <div className="canvasViewport">
            <div className="canvasColumn">
              <div className="frameLabel" aria-hidden="true">{projectName || "Artboard"} · {customW} × {customH}</div>
              <div className="canvasWrap" data-transparent={activeClipFill === "transparent" ? "true" : undefined}>
                <canvas ref={canvasElRef} width={500} height={750} />
                {markup?.phase === "draw" && (
                  <canvas
                    ref={markupOverlayRef}
                    className="markupOverlay"
                    data-testid="markup-overlay"
                    aria-label="Circle the region to edit"
                    onPointerDown={(e) => {
                      const p = markupPoint(e.clientX, e.clientY);
                      if (p) markupLiveRef.current = [p];
                      try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* synthetic/untracked pointers cannot capture, the stroke already started */ }
                    }}
                    onPointerMove={(e) => {
                      const live = markupLiveRef.current;
                      if (!live) return;
                      const p = markupPoint(e.clientX, e.clientY);
                      if (p) live.push(p);
                    }}
                    onPointerUp={() => {
                      const live = markupLiveRef.current;
                      markupLiveRef.current = null;
                      if (live && live.length >= 1) {
                        markupStrokesRef.current.push(live);
                        setMarkupStrokeCount(markupStrokesRef.current.length);
                      }
                    }}
                  />
                )}
                {markup?.phase === "draw" && (
                  <div className="markupBar" data-testid="markup-bar">
                    <span>Circle the part to change</span>
                    <button disabled={markupStrokeCount === 0} onClick={() => setMarkup((m) => (m ? { ...m, phase: "ask" } : m))}>Done circling</button>
                    <button className="ctxDanger" onClick={endMarkupEdit}>Cancel</button>
                  </div>
                )}
                {markup?.phase === "ask" && (
                  <div className="markupBar markupAsk" data-testid="markup-ask">
                    <textarea
                      aria-label="What should happen inside the circle"
                      rows={1}
                      placeholder="What should happen inside the circle?"
                      value={markupPrompt}
                      onChange={(e) => setMarkupPrompt(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                          e.preventDefault();
                          void runMarkupEdit();
                        }
                      }}
                    />
                    {!imageMock && <span className="mono">≈ 1 image edit</span>}
                    <button className="ctxAi" disabled={aiBusy || !markupPrompt.trim()} onClick={() => void runMarkupEdit()}>✦ Run</button>
                    <button onClick={() => setMarkup((m) => (m ? { ...m, phase: "draw" } : m))}>Back</button>
                    <button className="ctxDanger" onClick={endMarkupEdit}>Cancel</button>
                  </div>
                )}
                {!cropping && <ContextToolbar canvas={canvas} onEditWithAi={editSelectionWithAi} onReplaceImage={(f) => void replaceSelectedImage(f)} onDuplicate={() => void duplicateSelection()} onMakeTextEditable={() => setTextEditPhase("ask")} onSplitLayer={() => void ensureSplitModels().then((ok) => { if (ok) setSplitPhase("ask"); })} onRemoveBackground={() => void runRemoveBackground()} onCrop={() => void beginCrop()} onCircleEdit={markupCapable ? beginMarkupEdit : undefined} />}
                {guidesOn && activeGuide && guideRects(activeGuide.zones, customW, customH).map((r) => (
                  <div
                    key={r.edge}
                    className="guideZone"
                    data-edge={r.edge}
                    aria-hidden="true"
                    style={{ left: Math.round(r.left * zoom), top: Math.round(r.top * zoom), width: Math.round(r.width * zoom), height: Math.round(r.height * zoom) }}
                  />
                ))}
                {guidesOn && activeGuide && (
                  <span className="guideBadge" title={activeGuide.note}>
                    {activeGuide.label} safe zones · {activeGuide.confidence === "measured" ? "community-measured" : "estimated"}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="zoomBar">
            <button onClick={togglePan} title="Pan canvas" aria-label="Pan canvas" aria-pressed={panning} style={{ background: panning ? "var(--accent-soft)" : "transparent" }}><I d={icons.hand} size={15} /></button>
            <button onClick={() => zoomBy(-0.1)} aria-label="Zoom out"><I d={icons.minus} size={15} /></button>
            <input
              className="zoomInput"
              type="number"
              min={5}
              max={200}
              aria-label="Zoom percent"
              value={zoomText ?? String(Math.round(zoom * 100))}
              onFocus={(e) => setZoomText(e.currentTarget.value)}
              onChange={(e) => setZoomText(e.target.value)}
              onBlur={commitZoomText}
              onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
            /><span className="zoomAffix" aria-hidden="true">%</span>
            <button onClick={() => zoomBy(0.1)} aria-label="Zoom in"><I d={icons.plus} size={15} /></button>
            <button onClick={fitView} title="Fit to screen" aria-label="Fit to screen"><I d={icons.fit} size={15} /></button>
            <button
              onClick={cycleGuides}
              disabled={!guidesEligible}
              aria-pressed={guidesOn}
              aria-label="Toggle platform safe-zone guides"
              title={!guidesEligible ? "This guide assumes a 9:16 stage (1080 × 1920)" : guidesOn ? activeGuide?.note : "Show where the platform UI usually covers the stream"}
              style={{ width: "auto", padding: "0 8px", gap: 4, fontSize: 11, fontWeight: 600, color: guidesOn ? "var(--accent)" : undefined, background: guidesOn ? "var(--accent-soft)" : undefined }}
            >
              Safe zones{guidesOn && activeGuide ? `: ${activeGuide.label}` : ""}
            </button>
          </div>
          <div className="boardLabel">Page {activePage + 1} / {Math.max(1, pages.length)}</div>
          <div className="pageStrip">
            {pages.map((page, i) => (
              <div key={page.id} className={i === activePage ? "pageThumb active" : "pageThumb"}>
                <button className="pageThumbSelect" aria-label={`Go to page ${i + 1}`} aria-pressed={i === activePage} onClick={() => opSwitchPage(i)}>
                  {pageThumbs[page.id] ? <img src={pageThumbs[page.id]} alt="" /> : <ScenePreview scene={page.canvas} label={`Page ${i + 1}`} />}
                  <span>{i + 1}</span>
                </button>
                {pages.length > 1 && i === activePage && <button className="thumbX" aria-label={`Delete page ${i + 1}`} title="Delete page" onClick={opRemovePage}>×</button>}
              </div>
            ))}
            <button className="pageThumb add" aria-label="Add page" title="Add page" onClick={opAddPage}><I d={icons.plus} size={16} /></button>
            <button className="pageThumb add" aria-label="Duplicate page" title="Duplicate page" onClick={opDuplicatePage}><I d={icons.copy} size={15} /></button>
          </div>
        </section>
      </div>

      {/* Export dialog (BR-ED5) */}
      {/* SG-8 crop dialog: marquee is live on the canvas behind it */}
      {cropping && (
        <Dialog onClose={() => cancelCrop()} label="Crop image">
          <h3>Crop this image</h3>
          <p>Drag the box or its corners, then apply. The original pixels are kept, undo restores everything.</p>
          <div className="dialogActions">
            <button className="secondaryBtn" data-testid="crop-cancel" onClick={() => cancelCrop()}>Cancel</button>
            <button className="primaryBtn" data-testid="crop-apply" onClick={() => void applyCrop()}>Apply crop</button>
          </div>
        </Dialog>
      )}
      {/* D21 split-layer dialog: local SAM 3, no provider quota */}
      {splitPhase && splitPhase !== "models" && (
        <Dialog onClose={() => { if (splitPhase !== "running") setSplitPhase(null); }} label="Split layer">
          <h3>Cut an object out of this image</h3>
          <p>Type what to cut out. It runs on your machine (first use downloads a one-time 880 MB AI model).</p>
          <input autoFocus data-testid="split-prompt" value={splitPrompt} maxLength={64} placeholder="e.g. product, package, bottle" onChange={(e) => setSplitPrompt(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && splitPrompt.trim() && splitPhase !== "running") void runSplitLayer(); }} disabled={splitPhase === "running"} style={{ width: "100%", padding: "8px 10px", marginBottom: 8 }} />
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
            {["product", "package", "bottle", "cup", "label", "person"].map((chip) => (
              <button key={chip} className="chip" type="button" onClick={() => setSplitPrompt(chip)} disabled={splitPhase === "running"}>{chip}</button>
            ))}
          </div>
          {splitPhase === "running" && <p className="hintP" data-testid="split-running">Cutting "{splitPrompt}" out…</p>}
          <div className="dialogActions">
            <button className="secondaryBtn" onClick={() => void cancelSplit()}>{splitPhase === "running" ? "Stop" : "Cancel"}</button>
            <button className="primaryBtn" data-testid="split-confirm" disabled={splitPhase === "running" || !splitPrompt.trim()} onClick={() => void runSplitLayer()}>Split layer</button>
          </div>
        </Dialog>
      )}
      {splitPhase === "models" && (
        <Dialog onClose={() => setSplitPhase(null)} label="Split layer model">
          <h3>Downloading the split model</h3>
          <p className="hintP" data-testid="split-model-note">{splitModelNote || "Preparing…"}</p>
          <div className="dialogActions"><button className="secondaryBtn" onClick={() => setSplitPhase(null)}>Hide</button></div>
        </Dialog>
      )}
      {textEditPhase && (
        <Dialog onClose={() => { if (textEditPhase !== "running") setTextEditPhase(null); }} label="Make text editable">
          <h3>Make this text editable?</h3>
          <p>Oia reads the text on this page, cleans the text regions, and rebuilds editable layers with matching color, angle and spacing. Fonts are approximated from available families; complex lettering may need adjustment.</p>
          {!imageMock && <p className="hintP" data-testid="text-edit-cost">Up to 1 image + 1 read; font matching runs locally</p>}
          {textEditPhase === "running" && <p className="hintP">Reading text, restoring the background and comparing font samples…</p>}
          <div className="dialogActions">
            <button className="secondaryBtn" onClick={() => void cancelTextEdit()}>{textEditPhase === "running" ? "Stop" : "Cancel"}</button>
            <button className="primaryBtn" data-testid="text-edit-confirm" disabled={textEditPhase === "running"} onClick={() => void runMakeTextEditable()}>Make text editable</button>
          </div>
        </Dialog>
      )}
      {exportOpen && (
        <Dialog onClose={() => setExportOpen(false)} labelledBy="export-title">
          <div className="sectionHeading"><h3 id="export-title" style={{ margin: 0 }}>Export design</h3><button autoFocus className="iconBtn" aria-label="Close export" onClick={() => setExportOpen(false)}><I d={icons.x} size={18} /></button></div>
          <label htmlFor="export-format">File format</label>
          <select id="export-format" value={exportFormat} onChange={(e) => setExportFormat(e.target.value as ExportFormat)}>
            <option value="png">PNG</option>
            <option value="jpg">JPG</option>
            <option value="pdf">PDF</option>
            <option value="pptx">PPTX</option>
            <option value="zip">ZIP (jpg)</option>
          </select>
          <label>Pages to export</label>
          <div className="scopeRow">
            <button className={exportScope === "all" ? "chip active" : "chip"} onClick={() => setExportScope("all")}>All ({Math.max(1, pages.length)})</button>
            <button className={exportScope === "current" ? "chip active" : "chip"} onClick={() => setExportScope("current")}>Current page</button>
          </div>
          {(exportScope === "all" ? pages : [pages[activePage] ?? pages[0]]).some(
            (p) => p?.canvas?.objects?.find((o) => o.name === "clip")?.fill === "transparent",
          ) && (
            <p className="hintP" data-testid="alpha-hint" style={{ margin: "6px 0 0" }}>PNG keeps transparency, JPG flattens it.</p>
          )}
          <button className="primaryBtn wide" disabled={exporting} onClick={doExport} data-testid="export-download">
            {exporting ? "Exporting…" : "Download"}
          </button>
        </Dialog>
      )}
    </main>
  );
}

/** Rail icons, inline so the desktop adds zero icon deps (parity: lucide on web). */
function PanelIcon({ p }: { p: Panel }) {
  const d: Record<Panel, string> = {
    templates: "M3 3h8v8H3zM13 3h8v5h-8zM13 10h8v11h-8zM3 13h8v8H3z",
    assets: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6",
    text: "M4 6h16M9 6v13h6",
    shapes: "M7 3l7 4v8l-7 4-7-4V7zM17 3a4 4 0 1 1 0 8 4 4 0 0 1 0-8z",
    tables: "M3 5h18v14H3zM3 10h18M9 5v14M15 5v14",
    draw: "M12 19l7-7 3 3-7 7-3-3zM18 13l-1.5-7.5L2 2l3.5 14.5L13 18l5-5zM2 2l7.6 7.6",
    layers: "M12 3l9 5-9 5-9-5 9-5zM3 13l9 5 9-5M3 17.5l9 5 9-5",
    page: "M6 2h9l5 5v15H6zM15 2v5h5",
  };
  return <I d={d[p]} size={21} />;
}

/** pptxgenjs resolves differently under Vite ESM, accept both module shapes. */
async function makePptx(images: { jpg: string; png: string; width: number; height: number }[], dims: { width: number; height: number }) {
  const mod = await import("pptxgenjs");
  const Ctor = ((mod as unknown as { default?: new () => PptxLike }).default ?? mod) as unknown as new () => PptxLike;
  const pptx = new Ctor();
  const inW = dims.width / 96, inH = dims.height / 96;
  pptx.defineLayout({ name: "PXF", width: inW, height: inH });
  pptx.layout = "PXF";
  for (const im of images) {
    const scale = Math.min(inW / im.width, inH / im.height), w = im.width * scale, h = im.height * scale;
    pptx.addSlide().addImage({ data: im.png, x: (inW - w) / 2, y: (inH - h) / 2, w, h });
  }
  return pptx;
}

interface PptxLike {
  defineLayout(o: { name: string; width: number; height: number }): void;
  layout: string;
  addSlide(): { addImage(o: { data: string; x: number; y: number; w: number; h: number }): unknown };
  write(o: { outputType: string }): Promise<unknown>;
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

/** fitArtboard/sceneSize, same math as the web studio-ui lib (transport-free). */
function fitArtboard(width: number, height: number, availableWidth: number, availableHeight: number): number {
  const w = Math.max(1, width), h = Math.max(1, height);
  return Math.max(0.01, Math.min(1, Math.max(1, availableWidth - 64) / w, Math.max(1, availableHeight - 160) / h));
}
function sceneSize(scene: { objects: { type?: string | null; name?: string | null; width?: number | null; height?: number | null }[] }): { width: number; height: number } {
  const clip = scene.objects.find((o) => o.name === "clip") ?? scene.objects.find((o) => o.type?.toLowerCase() === "rect");
  const w = clip?.width, h = clip?.height;
  return { width: typeof w === "number" && Number.isFinite(w) && w > 0 ? w : 1360, height: typeof h === "number" && Number.isFinite(h) && h > 0 ? h : 2048 };
}
function fontStack(): string {
  return getComputedStyle(document.body).fontFamily.split(",")[0].replaceAll('"', "");
}

/** A renderer crash must never be a white window for a non-technical user. */
export class EditorErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <main className="appShell">
          <div className="notice error" role="alert">
            The editor hit a display error. Reopen the window and try again, your work is saved.
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
