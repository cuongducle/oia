"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type * as fabricNS from "fabric";
import type { SceneCanvas, ChatEvent, Template } from "@oia/schema";
import {
  SIZE_PRESETS, SHAPES, TEXT_PRESET_SPECS, planExport, resizeWithLock,
  addPage, removePage as removePageModel, duplicatePage, blankScene, applySizeToAllPages,
  type ExportFormat, type ExportScope, type ShapeKind, type TextPreset, type SizePresetName, type EditorPage,
} from "@oia/canvas";
import { stripMarkers } from "@oia/protocol";
import { Share2, Download, Cloud, ArrowLeft, Undo2, Redo2, LayoutTemplate, Image as ImageIcon, Type, Shapes, Table2, PenLine, Settings2, History, Plus, X, ArrowUp, Sparkles, Hand, Minus, Maximize, Copy, Globe, AlignLeft, AlignCenter, AlignRight, ChevronsUp, ChevronUp, ChevronDown, ChevronsDown } from "lucide-react";
import { fitArtboard, sceneSize } from "@/libs/studio-ui";
import { Dialog } from "@/components/Dialog";
import { ScenePreview } from "@/components/ScenePreview";
import { presentError } from "@/libs/provider-errors";
import { t } from "@/libs/i18n";
import { mergeScenePreservingUserObjects, stampUser } from "@oia/canvas";

type Panel = "templates" | "assets" | "text" | "shapes" | "tables" | "draw" | "settings";

interface EditorState {
  canvas: fabricNS.Canvas | null;
  sceneLoaded: boolean;
  projectName: string;
}

export default function EditorPage() {
  const router = useRouter();
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<fabricNS.Canvas | null>(null);
  const [panel, setPanel] = useState<Panel | null>(null);
  const canvasAreaRef = useRef<HTMLElement>(null);
  const sceneDimensions = useRef({ width: 1360, height: 2048 });
  const autoFit = useRef(true);
  const [notice, setNotice] = useState("");
  const [projectName, setProjectName] = useState("Untitled project");
  const [hasScene, setHasScene] = useState(false);
  const [selectedText, setSelectedText] = useState(false);
  const [zoom, setZoom] = useState(0.35);
  const [exportOpen, setExportOpen] = useState(false);
  const [exportFormat, setExportFormat] = useState<ExportFormat>("png");
  const [exportScope, setExportScope] = useState<ExportScope>("all");
  const [exporting, setExporting] = useState(false);
  const [customW, setCustomW] = useState(1360);
  const [customH, setCustomH] = useState(2048);
  // BR-PERSIST editor: project server + auto-save + undo/redo
  const [projectId, setProjectId] = useState<string | null>(null);
  const [saveState, setSaveState] = useState<"saved" | "saving" | "dirty">("saved");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  // AI panel (BR gap #3)
  const [aiOpen, setAiOpen] = useState(true);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [aiTimeline, setAiTimeline] = useState<{ content: string; type: string }[]>([]);
  // TP.5: the AI dock streams the same SSE path — its Stop uses the same cancel API
  const aiJobRef = useRef<string | null>(null);
  const aiStreamAbortRef = useRef<AbortController | null>(null);
  const [aiError, setAiError] = useState<{ message: string; actionLabel?: string; actionKind?: string } | null>(null);
  // TP.11: reference-composer path is capability-gated — unsupported providers never receive refs silently
  const [refCapable, setRefCapable] = useState(true);
  useEffect(() => {
    void fetch("/api/provider/status").then(r => r.json()).then(j => {
      if (j.code === 0) setRefCapable(Boolean(j.data.image?.capabilities?.referenceImages));
    }).catch(() => {});
  }, []);
  const [aiNarrative, setAiNarrative] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [chats, setChats] = useState<{ id: number; name: string }[]>([]);
  // Templates/Assets/Draw
  const [tplList, setTplList] = useState<Template[]>([]);
  const [assets, setAssets] = useState<string[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [panning, setPanning] = useState(false);
  const [pageThumbs, setPageThumbs] = useState<Record<string, string>>({});
  const [pages, setPages] = useState<EditorPage[]>([]);
  const [activePage, setActivePage] = useState(0);
  const currentState = useRef({ pages, activePage, projectName, projectId, customW, customH });
  const restoring = useRef(false);
  const pendingSave = useRef<Promise<string | null> | null>(null);
  useEffect(() => { currentState.current = { pages, activePage, projectName, projectId, customW, customH }; }, [pages, activePage, projectName, projectId, customW, customH]);

  // capture the current page’s scene JSON
  function captureThumb(idx: number) {
    const c = fabricRef.current; if (!c) return;
    try {
      const url = c.toDataURL({ format: "png", multiplier: 60 / Math.max(c.getWidth(), 1) } as never);
      const id = currentState.current.pages[idx]?.id;
      if (id) setPageThumbs((t) => ({ ...t, [id]: url }));
    } catch { /* canvas not rendered yet */ }
  }

  const snapshotActive = useCallback((): EditorPage | null => {
    const c = fabricRef.current;
    if (!c) return null;
    const scene = c.toObject() as unknown as EditorPage["canvas"];
    return { id: pages[activePage]?.id ?? `page_${activePage}`, canvas: scene };
  }, [pages, activePage]);

  const loadPage = useCallback(async (idx: number, list: EditorPage[]) => {
    const c = fabricRef.current; if (!c) return;
    restoring.current = true;
    try {
      await c.loadFromJSON(list[idx].canvas);
      const size = sceneSize(list[idx].canvas);
      sceneDimensions.current = size; setCustomW(size.width); setCustomH(size.height);
      const family = getComputedStyle(document.body).fontFamily.split(",")[0].replaceAll('"', "");
      c.getObjects().forEach(o => { if ("fontFamily" in o && o.fontFamily === "Be Vietnam Pro") o.set("fontFamily" as never, family as never); });
      undoStack.current = [JSON.stringify(c.toObject())]; redoStack.current = [];
      setCanUndo(false); setCanRedo(false); setSelectedText(false); fitView();
      c.requestRenderAll(); captureThumb(idx);
    } finally { restoring.current = false; }
    scheduleSave();
  }, []); // eslint-disable-line

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
  }, [customW, customH]); // eslint-disable-line
  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setExportOpen(false); setHistoryOpen(false); setPanel(null); } };
    const shortcuts = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || (e.target instanceof Element && e.target.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]'))) return;
      if (e.key.toLowerCase() === "z") { e.preventDefault(); if (e.shiftKey) void redoOp(); else void undo(); }
      else if (e.key.toLowerCase() === "y") { e.preventDefault(); void redoOp(); }
    };
    window.addEventListener("keydown", esc); window.addEventListener("keydown", shortcuts);
    return () => { window.removeEventListener("keydown", esc); window.removeEventListener("keydown", shortcuts); };
  }, []);

  // load fabric + the scene from localStorage (Home stores it after generation)
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

      const pid = new URLSearchParams(window.location.search).get("id");
      let initialScene: SceneCanvas | null = null;
      let initialName = "Untitled project";
      let initialPages: EditorPage[] | null = null;
      // TP.7 (Slice 2): handoff is by projectId only — the localStorage scene-blob path is gone
      // (a multi-MB Codex PNG at ~1.33× base64 against the ~5MB quota was a blank-canvas risk).
      if (pid) {
        const j = await (await fetch(`/api/projects/${pid}`)).json();
        if (j.code === 0) {
          setProjectId(j.data.id);
          initialName = j.data.name;
          initialPages = j.data.pages;
          initialScene = j.data.pages[0]?.canvas ?? null;
        } else { throw new Error("Project not found"); }
      }
      if (cancelled) return;
      setProjectName(initialName);
      if (initialPages && initialPages.length) {
        setPages(initialPages); setActivePage(0);
        await editor.loadFromJSON(initialPages[0].canvas);
        editor.requestRenderAll();
        setHasScene(true);
        const size = sceneSize(initialPages[0].canvas);
        setCustomW(size.width); setCustomH(size.height);
      } else if (initialScene) {
        await editor.loadFromJSON(initialScene);
        editor.requestRenderAll();
        setHasScene(true);
        const size = sceneSize(initialScene); setCustomW(size.width); setCustomH(size.height);
      } else {
        editor.setDimensions({ width: 1360, height: 2048 });
        const fabric = await import("fabric");
        editor.add(new fabric.Rect({ left: 0, top: 0, width: 1360, height: 2048, fill: "#ffffff", selectable: false, name: "clip" }));
      }
      if (cancelled) return;
      const first = initialPages?.[0]?.canvas ?? initialScene;
      sceneDimensions.current = first ? sceneSize(first) : { width:1360, height:2048 };
      if (!initialPages?.length) setPages([{ id: "page_1", canvas: (first ?? editor.toObject()) as SceneCanvas }]);
      const family = getComputedStyle(document.body).fontFamily.split(",")[0].replaceAll('"', "");
      await document.fonts.ready;
      editor.getObjects().forEach(o => { if ("fontFamily" in o && o.fontFamily === "Be Vietnam Pro") o.set("fontFamily" as never, family as never); });
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
      editor.on("selection:created", (e) => setSelectedText(e.selected?.[0]?.type === "textbox"));
      editor.on("selection:updated", (e) => setSelectedText(e.selected?.[0]?.type === "textbox"));
      editor.on("selection:cleared", () => setSelectedText(false));
      if (!pid) scheduleSave();
    })().catch(() => { if (!cancelled) setNotice("Could not open the design. Reload the page or try another project."); });
    return () => {
      cancelled = true;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      if (fabricRef.current === owned) fabricRef.current = null;
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
    const z = Math.min(2, Math.max(0.05, zoom + d));
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
    const snap = c.toObject() as SceneCanvas;
    const list = state.pages.map((p,i) => i === state.activePage ? { ...p, canvas: snap } : p);
    const payload = { name: state.projectName, pages: list.map((p,i) => ({ ...p, name:`Page ${i+1}`, ...sceneSize(p.canvas) })) };
    const request = (async () => {
      try {
        const res = await fetch(state.projectId ? `/api/projects/${state.projectId}` : "/api/projects", { method:state.projectId ? "PATCH" : "POST", headers:{"content-type":"application/json"},body:JSON.stringify(payload) });
        const j = await res.json();
        if (!res.ok || j.code !== 0) throw new Error();
        const id = state.projectId ?? j.data.id;
        currentState.current.projectId = id; setProjectId(id);
        window.history.replaceState(null,"",`/editor?id=${id}`);
        setSaveState("saved");
        if (currentState.current.activePage === state.activePage) captureThumb(state.activePage);
        return id as string;
      } catch { setSaveState("dirty"); setNotice("Your design could not be saved. Check your connection and try again."); return null; }
    })();
    pendingSave.current = request;
    try { return await request; } finally { pendingSave.current = null; }
  }

  async function undo() {
    const c = fabricRef.current; if (!c || undoStack.current.length < 2) return;
    redoStack.current.push(undoStack.current.pop()!);
    const prev = undoStack.current.at(-1)!;
    restoring.current = true;
    try { await c.loadFromJSON(JSON.parse(prev)); const size=sceneSize(c.toObject() as SceneCanvas); sceneDimensions.current=size; setCustomW(size.width); setCustomH(size.height); fitView(); } finally { restoring.current = false; }
    setCanUndo(undoStack.current.length >= 2); setCanRedo(true);
    scheduleSave();
  }
  async function redoOp() {
    const c = fabricRef.current; if (!c || !redoStack.current.length) return;
    const next = redoStack.current.pop()!;
    undoStack.current.push(next);
    restoring.current = true;
    try { await c.loadFromJSON(JSON.parse(next)); const size=sceneSize(c.toObject() as SceneCanvas); sceneDimensions.current=size; setCustomW(size.width); setCustomH(size.height); fitView(); } finally { restoring.current = false; }
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
    const res = await fetch("/api/templates", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: projectName, authorName: "You", scene: snap.canvas }),
    });
    const j = await res.json();
    setNotice(j.code === 0 ? "Published to the community." : j.msg);
  }

  async function loadTemplates() {
    const j = await (await fetch("/api/templates?pageSize=20")).json();
    if (j.code === 0) setTplList(j.data.items);
  }
  async function replaceCurrentScene(scene: SceneCanvas) {
    const c = fabricRef.current; if (!c) return;
    const history = [...undoStack.current];
    const list = pages.map((p,i)=>i===activePage?{...p,canvas:scene}:p);
    setPages(list); await loadPage(activePage,list);
    undoStack.current = [...history,JSON.stringify(c.toObject())].slice(-40);
    setCanUndo(undoStack.current.length>1); setHasScene(true);
  }
  async function applyTemplate(t: Template) { await replaceCurrentScene(t.scene); }
  async function uploadAsset(file: File) {
    const fd = new FormData(); fd.set("file", file);
    const j = await (await fetch("/api/upload/direct", { method: "POST", body: fd })).json();
    if (j.code === 0) { setAssets((a) => [...a, j.data.url]); await addImageLayer(j.data.url); }
  }
  async function addImageLayer(url: string) {
    const c = fabricRef.current; if (!c) return;
    const fabric = await import("fabric");
    const img = await fabric.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    img.scaleToWidth((c.getWidth() / c.getZoom()) * 0.8);
    stampUser(img as unknown as import("@oia/schema").FabricObject); // TP.10: user upload — never wiped by refinement
    c.add(img); c.setActiveObject(img); c.requestRenderAll();
  }
  async function insertTable(n: number) {
    const c = fabricRef.current; if (!c) return;
    const fabric = await import("fabric");
    const w = c.getWidth()/c.getZoom(), h = c.getHeight()/c.getZoom();
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
      c.forEachObject((obj) => { const background = (obj as fabricNS.Object & {name?:string}).name === "clip"; obj.selectable = !next && !background; obj.evented = !next && !background; });
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
    const j = await (await fetch("/api/chat/sessions")).json();
    if (j.code === 0) setChats(j.data);
    setHistoryOpen((h) => !h);
  }
  function mentionSelection() {
    const c = fabricRef.current; if (!c) return;
    const obj = c.getActiveObject() as (fabricNS.Object & { text?: string; src?: string }) | undefined;
    if (!obj) { setAiPrompt((p) => `${p}@(select a layer on the canvas first) `); return; }
    const label = obj.type === "textbox" ? `"${(obj.text ?? "").slice(0, 40)}"` : obj.src ? `[${obj.src.slice(-40)}]` : obj.type ?? "layer";
    setAiPrompt((p) => `${p}@(selected ${obj.type}: ${label}) `);
  }
  async function runAiEdit() {
    if (aiBusy || !aiPrompt.trim()) return;
    setAiBusy(true); setAiTimeline([]); setAiNarrative(""); setAiError(null); aiJobRef.current = null;
    const streamAbort = new AbortController();
    aiStreamAbortRef.current = streamAbort;
    try {
      const scene = fabricRef.current?.toObject();
      const refs = refCapable
        ? scene?.objects?.filter((o: { src?: string }) => o.src).map((o: { src: string }) => o.src).slice(0, 2)
        : undefined; // capability-gated (TP.11): never send refs to a provider that cannot use them
      const res = await fetch("/api/chat/send", {
        method: "POST", headers: { "content-type": "application/json" }, signal: streamAbort.signal,
        body: JSON.stringify({ prompt: aiPrompt, referenceImages: refs }),
      });
      if (!res.ok || !res.body) throw new Error("Could not connect to your AI provider.");
      const reader = res.body.getReader(); const dec = new TextDecoder(); let buf = "";
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        buf += dec.decode(value, { stream: true }); const lines = buf.split("\n"); buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5); if (payload === "[Heartbeat]") continue;
          let ev: ChatEvent; try { ev = JSON.parse(payload) as ChatEvent; } catch { continue; }
          if (ev.jobId) aiJobRef.current = ev.jobId;
          if (ev.status === "cancelled") { setAiError({ message: t("en", "error.cancelled") }); continue; }
          if (ev.error) {
            const p = presentError(ev.errorClass);
            setAiError({ message: t("en", p.messageKey), actionLabel: p.actionLabelKey ? t("en", p.actionLabelKey) : undefined, actionKind: p.actionKind });
          }
          if (ev.renderData?.taskMeta?.length) setAiTimeline(ev.renderData.taskMeta.map((tm) => ({ content: tm.content, type: tm.type })));
          if (ev.content) setAiNarrative((n) => n + stripMarkers(ev.content) + " ");
          for (const m of ev.renderData?.msgMeta ?? []) {
            if (m.type === "canvas") {
              const c = fabricRef.current; if (!c) break;
              // TP.10 non-destruction: the refined page REPLACES the canvas, but every
              // user-added layer (origin "user", legacy default included) survives on top —
              // the worst-case failure (refinement wipes the user's hand-composited product
              // photo) is structurally impossible now
              const merged = mergeScenePreservingUserObjects(c.toObject(), m.canvas as SceneCanvas);
              await replaceCurrentScene(merged.scene);
            }
          }
        }
      }
    } catch (e) { if ((e as Error).name !== "AbortError") setNotice("The AI edit could not be completed. Check your provider settings and try again."); }
    finally { setAiBusy(false); aiStreamAbortRef.current = null; }
  }
  /** TP.5 — cancel API only; the server emits the terminal event and closes the stream
   *  (aborting the reader would swallow the cancelled message — see Home stop()). */
  async function stopAiEdit() {
    if (aiJobRef.current) await fetch("/api/chat/cancel", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ jobId: aiJobRef.current }) }).catch(() => {});
  }

  async function addText(kind: TextPreset) {
    const { addTextPreset } = await import("@oia/canvas");
    const family = getComputedStyle(document.body).fontFamily.split(",")[0].replaceAll('"', "");
    callCanvas((c) => addTextPreset(c, kind, family));
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
    sceneDimensions.current = {width:w,height:h}; fitView(); scheduleSave();
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

      // snapshot the current page’s scene into pages
      const snap = snapshotActive();
      const list = (snap ? pages.map((p, i) => (i === activePage ? snap : p)) : pages).slice();
      if (list.length === 0) list.push({ id: "page_1", canvas: blankScene(customW, customH) });
      const exportList = plan.scope === "all" ? list : [list[activePage] ?? list[0]];

      // Export on an isolated canvas: never mutate the active page, its history, or autosave.
      const { StaticCanvas } = await import("fabric");
      const renderer = new StaticCanvas(document.createElement("canvas"), { renderOnAddRemove:false });
      const images: { jpg:string; png:string; width:number; height:number }[] = [];
      try {
        await document.fonts.ready;
        const family = getComputedStyle(document.body).fontFamily.split(",")[0].replaceAll('"', "");
        for (const page of exportList) {
          const size = sceneSize(page.canvas);
          await renderer.loadFromJSON(page.canvas);
          renderer.setDimensions(size);
          renderer.getObjects().forEach(o => { if ("fontFamily" in o && o.fontFamily === "Be Vietnam Pro") o.set("fontFamily" as never, family as never); });
          renderer.renderAll();
          images.push({ ...size, jpg:renderer.toDataURL({format:"jpeg",quality:plan.defaultQuality,multiplier:1}), png:renderer.toDataURL({format:"png",multiplier:1}) });
        }
      } finally { await renderer.dispose(); }
      const dims = images[0];

      let blob: Blob | null = null;
      if (plan.strategy === "canvas-dataurl") {
        blob = dataUrlToBlob(plan.format === "png" ? images[0].png : images[0].jpg);
      } else if (plan.strategy === "jspdf") {
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: dims.width > dims.height ? "landscape" : "portrait", unit: "px", hotfixes:["px_scaling"], format: [dims.width, dims.height] });
        images.forEach((im, i) => {
          if (i > 0) pdf.addPage([im.width, im.height], im.width > im.height ? "landscape" : "portrait");
          pdf.addImage(im.jpg, "JPEG", 0, 0, im.width, im.height);
        });
        blob = pdf.output("blob");
      } else if (plan.strategy === "pptxgenjs") {
        const PptxGenJS = (window as unknown as { PptxGenJS?: new () => PptxLike }).PptxGenJS
          ?? (await loadScript("/vendor/pptxgenjs.bundle.js"), (window as unknown as { PptxGenJS: new () => PptxLike }).PptxGenJS);
        const pptx = new PptxGenJS();
        const inW = dims.width / 96, inH = dims.height / 96;
        pptx.defineLayout({ name: "PXF", width: inW, height: inH });
        pptx.layout = "PXF";
        for (const im of images) {
          const scale = Math.min(inW/im.width,inH/im.height), w = im.width*scale, h = im.height*scale;
          pptx.addSlide().addImage({ data:im.png,x:(inW-w)/2,y:(inH-h)/2,w,h });
        }
        blob = (await pptx.write({ outputType: "blob" })) as Blob;
      } else if (plan.strategy === "jszip") {
        const JSZip = (await import("jszip")).default;
        const zip = new JSZip();
        const folder = zip.folder(plan.fileName.replace(/\.zip$/, ""));
        images.forEach((im, i) => {
          const single = plan.format === "png" ? im.png : im.jpg;
          folder?.file(`${i + 1}.${plan.format === "zip" ? "jpg" : plan.format}`, dataUrlToBlob(single));
        });
        blob = await zip.generateAsync({ type: "blob" });
      }

      if (blob) {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = plan.fileName; a.click();
        setTimeout(()=>URL.revokeObjectURL(url),1000);
      }
    } catch { setNotice("Export failed. Check that all image files are available and try again."); }
    finally {
      setExporting(false);
      setExportOpen(false);
    }
  }

  const toolIcons = { templates: LayoutTemplate, assets: ImageIcon, text: Type, shapes: Shapes, tables: Table2, draw: PenLine, settings: Settings2 };
  const toolLabels = { templates: "Templates", assets: "Assets", text: "Text", shapes: "Shapes", tables: "Tables", draw: "Draw", settings: "Settings" };
  const shapeLabels: Record<ShapeKind, string> = useMemo(() => ({
    circle: "◯", rectRounded: "▢", rect: "□", triangleUp: "△", triangleDown: "▽",
    diamond: "◇", line: "—", lineDotted: "┄", arrowRight: "→",
  }), []);

  return (
    <main className="edRoot">
      {/* Top bar */}
      <div className="edTop">
        <button className="iconBtn" onClick={() => router.push("/")} aria-label="Back to Home"><ArrowLeft size={18}/></button>
        <span className="wordmark hideOnMobile" style={{fontSize:19,marginRight:12}}>O<span>ia</span></span>
        <input className="nameInput" aria-label="Project name" value={projectName} onChange={(e) => { setProjectName(e.target.value); }} onBlur={scheduleSave} />
        <button className="iconBtn" onClick={undo} disabled={!canUndo} title="Undo" aria-label="Undo"><Undo2 size={17}/></button>
        <button className="iconBtn" onClick={redoOp} disabled={!canRedo} title="Redo" aria-label="Redo"><Redo2 size={17}/></button>
        <span className="saveStatus">
          <Cloud size={12} /> {saveState === "saving" ? "Saving…" : saveState === "dirty" ? "Unsaved changes" : "Saved"}
        </span>
        <span className="spacer" />
        <button className="iconBtn" aria-label="Toggle AI assistant" title="AI assistant" onClick={() => setAiOpen(!aiOpen)} aria-pressed={aiOpen}><Sparkles size={17}/></button>
        <button className="secondaryBtn hideOnMobile" title="Share" onClick={async () => {
          if (saveTimer.current) clearTimeout(saveTimer.current);
          const id = await persistProject();
          if (id) { try { await navigator.clipboard.writeText(`${location.origin}/p/${id}`); setNotice("Share link copied."); } catch { setNotice(`${location.origin}/p/${id}`); } }
        }}><Share2 size={14}/>Share</button>
        <button className="iconBtn hideOnMobile" onClick={publishTemplate} aria-label="Publish community template" title="Publish community template"><Globe size={16}/></button>
        <button className="primaryBtn" style={{ display: "flex", alignItems: "center", gap: 5 }} onClick={() => setExportOpen(true)}>
          <Download size={14} /> Export
        </button>
      </div>

      {notice && <div className="notice" role="status" style={{margin:0,borderRadius:0,display:"flex",justifyContent:"space-between",padding:"6px 16px"}}>{notice}<button className="iconBtn" aria-label="Dismiss notification" onClick={()=>setNotice("")}><X size={13}/></button></div>}
      {/* Text toolbar (BR-ED4) — shown only when a Textbox is selected */}
      {selectedText && (
        <div className="textToolbar">
          <input type="color" defaultValue="#18181b" onChange={(e) => patchText({ fill: e.target.value })} title="Text color" />
          <button onClick={() => patchText({ bold: true })}><b>B</b></button>
          <button onClick={() => patchText({ italic: true })}><i>I</i></button>
          <button onClick={() => patchText({ underline: true })}><u>U</u></button>
          <button onClick={() => patchText({ strike: true })}><s>S</s></button>
          <button aria-label="Align left" onClick={() => patchText({ align: "left" })}><AlignLeft size={14}/></button>
          <button aria-label="Align center" onClick={() => patchText({ align: "center" })}><AlignCenter size={14}/></button>
          <button aria-label="Align right" onClick={() => patchText({ align: "right" })}><AlignRight size={14}/></button>
          <input type="number" placeholder="size" min={8} max={400}
            onChange={(e) => patchText({ fontSize: Number(e.target.value) })} style={{ width: 64 }} />
          <button onClick={() => patchText({ charSpacing: 200 })}>AB</button>
          <AsyncLayerBtns />
        </div>
      )}

      <div className="edBody">
        {/* Rail trái */}
        <nav className="rail" aria-label="Editor tools">
          {(["templates", "assets", "text", "shapes", "tables", "draw", "settings"] as Panel[]).map((p) => {
            const Icon = toolIcons[p];
            return <button key={p} className={panel === p ? "railBtn active" : "railBtn"} onClick={() => setPanel(panel === p ? null : p)} aria-pressed={panel===p} aria-label={toolLabels[p]}><Icon size={21} strokeWidth={1.6}/><span>{toolLabels[p]}</span></button>;
          })}
        </nav>

      {/* Panel content */}
        {panel && <aside className="panelBox">
          <div className="sectionHeading" style={{marginBottom:16}}><strong style={{fontSize:13}}>{toolLabels[panel]}</strong><button className="iconBtn" aria-label="Close tool panel" onClick={()=>setPanel(null)}><X size={15}/></button></div>
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
          {panel === "settings" && (
            <>
              <h4>Settings</h4>
              <p className="hintP">Change the look of your workspace</p>
              <label>Background color</label>
              <input type="color" defaultValue="#ffffff" onChange={(e) => callCanvas((c) => { c.backgroundColor = e.target.value; c.requestRenderAll(); })} />
              <label>Custom size (px)</label>
              <div className="sizeRow">
                <input type="number" aria-label="Artboard width" value={customW} onChange={(e) => { const w = Number(e.target.value) || 1; setCustomW(w); const r = resizeWithLock({ width: customW, height: customH }, { width: w }); setCustomH(r.height); applyCustom(r.width, r.height); }} />
                <span></span>
                <input type="number" aria-label="Artboard height" value={customH} onChange={(e) => { const h = Number(e.target.value) || 1; setCustomH(h); const r = resizeWithLock({ width: customW, height: customH }, { height: h }); setCustomW(r.width); applyCustom(r.width, r.height); }} />
              </div>
              <label>Recommended Size</label>
              {(Object.keys(SIZE_PRESETS) as SizePresetName[]).map((name) => (
                <button key={name} className="presetBtn small" onClick={() => applyPreset(name)}>
                  {name} <em>{SIZE_PRESETS[name].width} × {SIZE_PRESETS[name].height}</em>
                </button>
              ))}
              <button className="primaryBtn wide" style={{ marginTop: 8 }} onClick={async () => {
                const snap = snapshotActive();
                const list = (snap ? pages.map((p, i) => (i === activePage ? snap : p)) : pages)
                  .map((p) => ({ ...p, canvas: p.canvas }));
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
              <p className="hintP">Choose a community template for the current page.</p>
              <button className="presetBtn small" onClick={loadTemplates}>Refresh templates</button>
              {tplList.map((t) => (
                <button key={t.id} className="presetBtn small" onClick={() => applyTemplate(t)}>
                  {t.name} <em> {t.tipCredits}</em>
                </button>
              ))}
              {tplList.length === 0 && <p className="hintP">Refresh to load templates.</p>}
            </>
          )}
          {panel === "assets" && (
            <>
              <h4>Assets</h4>
              <p className="hintP">Upload an image, then select it to add it to the canvas.</p>
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
                <button key={n} className="presetBtn small" onClick={() => insertTable(n)}>{n} × {n} table</button>
              ))}
            </>
          )}
          {panel === "draw" && (
            <>
              <h4>Draw</h4>
              <p className="hintP">Draw freehand on your canvas.</p>
              <button className={drawing ? "presetBtn small" : "presetBtn small"} onClick={toggleDraw}>{drawing ? "Stop drawing" : "Start drawing"}</button>
            </>
          )}
        </aside>}

        {/* AI dock reserves its own column; never overlaps the document on desktop. */}
        {aiOpen && (
          <aside className="aiPanelFloating">
            <div className="aiPanelHeader"><Sparkles size={16} color="var(--accent)"/><strong>AI assistant</strong>
              <button className="iconBtn" aria-label="New conversation" onClick={() => { setAiTimeline([]); setAiNarrative(""); setAiPrompt(""); }}><Plus size={16}/></button>
              <button className="iconBtn" aria-label="Conversation history" onClick={loadChats}><History size={16}/></button>
              <button className="iconBtn" aria-label="Close AI assistant" onClick={() => setAiOpen(false)}><X size={16}/></button>
            </div>
            {!aiNarrative && !aiTimeline.length && <div className="aiPanelEmpty"><h3>What would you like to refine?</h3><p>Change colors, edit copy, or explore a different layout. Select a layer for a more precise edit.</p>{["Try a softer color palette", "Make the headline stand out"].map(s=><button key={s} className="aiSuggestion" onClick={()=>setAiPrompt(s)}>{s}</button>)}</div>}
            {historyOpen && (
              <div style={{ maxHeight: 140, overflowY: "auto", borderBottom: "1px solid var(--line)", marginBottom: 8 }}>
                {chats.map((c) => (
                  <div key={c.id} className="presetBtn small" style={{ cursor: "pointer" }} onClick={() => { window.location.href = `/?session=${c.id}`; }}>{c.name}</div>
                ))}
                {chats.length === 0 && <p className="hintP">No conversations yet.</p>}
              </div>
            )}
            <div className="timeline" style={{ margin: 0 }}>
              {aiTimeline.map((tm) => <div key={tm.content + tm.type} className={`t ${tm.type}`}>{tm.content}</div>)}
            </div>
            {aiError && <div role="alert" className="notice error" style={{ margin: "8px 0", fontSize: 12 }}>{aiError.message}</div>}
            {aiNarrative && <div className="narrative" style={{ marginTop: 8, maxHeight: 200, overflowY: "auto" }}>{aiNarrative}</div>}
            <div className="aiComposer">
              <textarea aria-label="AI edit request" value={aiPrompt} rows={3} placeholder="Describe the changes you have in mind…" onChange={(e) => setAiPrompt(e.target.value)} onKeyDown={e=>{if(e.key==="Enter"&&!e.shiftKey&&!e.nativeEvent.isComposing){e.preventDefault();void runAiEdit();}}}/>
              <div className="aiComposerControls"><button className="iconBtn" title="Use selected layer" aria-label="Mention selected layer" onClick={mentionSelection}>@</button><span className="hintP" style={{fontSize:10,margin:0}}>Layer by layer</span>{aiBusy
                ? <button className="generateBtn" style={{ background: "#dc2626" }} onClick={stopAiEdit} aria-label={t("en","editor.stop")} title={t("en","editor.stop")} aria-disabled={false}><span style={{ width: 12, height: 12, background: "#fff", display: "inline-block" }} /></button>
                : <button className="generateBtn" disabled={aiBusy || !aiPrompt.trim()} onClick={runAiEdit} aria-label={aiBusy?"Editing":"Send edit request"}><ArrowUp size={17}/></button>}</div>
            </div>
          </aside>
        )}
        {/* Canvas */}
        <section className="canvasArea" ref={canvasAreaRef} aria-label="Design workspace">
          <div className="canvasViewport"><div className="canvasWrap">
            <canvas ref={canvasElRef} width={500} height={750} />
          </div></div>
          <div className="zoomBar">
            <button onClick={togglePan} title="Pan canvas" aria-label="Pan canvas" aria-pressed={panning} style={{ background: panning ? "var(--accent-soft)" : "transparent" }}><Hand size={15}/></button>
            <button onClick={() => zoomBy(-0.1)} aria-label="Zoom out"><Minus size={15}/></button>
            <span>{Math.round(zoom * 100)}%</span>
            <button onClick={() => zoomBy(0.1)} aria-label="Zoom in"><Plus size={15}/></button>
            <button onClick={fitView} title="Fit to screen" aria-label="Fit to screen"><Maximize size={15}/></button>
          </div>
          <div className="boardLabel">Page {activePage + 1} / {Math.max(1,pages.length)} · {customW} × {customH}</div>
          <div className="pageStrip">
            {pages.map((page, i) => (
              <div key={page.id} className={i === activePage ? "pageThumb active" : "pageThumb"}>
                <button className="pageThumbSelect" aria-label={`Go to page ${i+1}`} aria-pressed={i===activePage} onClick={()=>opSwitchPage(i)}>
                  {pageThumbs[page.id] ? <img src={pageThumbs[page.id]} alt=""/> : <ScenePreview scene={page.canvas} label={`Page ${i+1}`}/>}
                  <span>{i+1}</span>
                </button>
                {pages.length>1 && i===activePage && <button className="thumbX" aria-label={`Delete page ${i+1}`} title="Delete page" onClick={opRemovePage}>×</button>}
              </div>
            ))}
            <button className="pageThumb add" aria-label="Add page" title="Add page" onClick={opAddPage}><Plus size={16}/></button>
            <button className="pageThumb add" aria-label="Duplicate page" title="Duplicate page" onClick={opDuplicatePage}><Copy size={15}/></button>
          </div>
        </section>
      </div>

      {/* Export dialog (BR-ED5) */}
      {exportOpen && (
        <Dialog onClose={() => setExportOpen(false)} labelledBy="export-title">
            <div className="sectionHeading"><h3 id="export-title" style={{margin:0}}>Export design</h3><button autoFocus className="iconBtn" aria-label="Close export" onClick={()=>setExportOpen(false)}><X size={18}/></button></div>
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
              <button className={exportScope === "all" ? "chip active" : "chip"} onClick={() => setExportScope("all")}>All ({Math.max(1,pages.length)})</button>
              <button className={exportScope === "current" ? "chip active" : "chip"} onClick={() => setExportScope("current")}>Current page</button>
            </div>
            <button className="primaryBtn wide" disabled={exporting} onClick={doExport}>
              {exporting ? "Exporting…" : "Download"}
            </button>
        </Dialog>
      )}
    </main>
  );
}

function AsyncLayerBtns() {
  return (
    <span>
      <button title="Bring to front" aria-label="Bring to front" onClick={() => runLayer("layerFront")}><ChevronsUp size={14}/></button>
      <button title="Bring forward" aria-label="Bring forward" onClick={() => runLayer("layerForward")}><ChevronUp size={14}/></button>
      <button title="Send backward" aria-label="Send backward" onClick={() => runLayer("layerBackward")}><ChevronDown size={14}/></button>
      <button title="Send to back" aria-label="Send to back" onClick={() => runLayer("layerBack")}><ChevronsDown size={14}/></button>
      <button title="Duplicate" aria-label="Duplicate selection" onClick={runDup}><Copy size={14}/></button>
    </span>
  );
  async function runLayer(a: "layerFront" | "layerForward" | "layerBackward" | "layerBack") {
    const c = (window as unknown as { __oiaCanvas?: fabricNS.Canvas }).__oiaCanvas;
    if (!c) return;
    const obj = c.getActiveObject();
    if (!obj) return;
    const { applyLayerAction } = await import("@oia/canvas");
    applyLayerAction(obj as unknown as Parameters<typeof applyLayerAction>[0], a);
    c.requestRenderAll();
  }
  async function runDup() {
    const c = (window as unknown as { __oiaCanvas?: fabricNS.Canvas }).__oiaCanvas;
    if (!c) return;
    const { duplicateSelected } = await import("@oia/canvas");
    duplicateSelected(c);
  }
}

interface PptxLike {
  defineLayout(o: { name: string; width: number; height: number }): void;
  layout: string;
  addSlide(): { addImage(o: { data: string; x: number; y: number; w: number; h: number }): unknown };
  write(o: { outputType: string }): Promise<unknown>;
}

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement("script");
    s.src = src; s.onload = () => resolve(); s.onerror = () => reject(new Error(`load ${src} fail`));
    document.head.appendChild(s);
  });
}

function dataUrlToBlob(dataUrl: string): Blob {
  const [meta, b64] = dataUrl.split(",");
  const mime = meta.match(/:(.*?);/)?.[1] ?? "application/octet-stream";
  const bin = atob(b64);
  const arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}
