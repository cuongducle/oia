import { useEffect, useRef, useState } from "react";
import { SCENE_VERSION } from "@oia/schema";
import type { ToolKind } from "../lib/tools-registry.js";
import { oia } from "../lib/bridge.js";
import { toDisplayUrl } from "../../shared/assets.js";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.min.mjs?url";

/**
 * reorg step 4c — the web ToolRunner (app/tools/[slug]/runner.tsx) ported to the
 * desktop bridge: the four fetch lanes become IPC (uploadAsset / submitTask+poll /
 * createProject), browser download anchors become the native save dialog
 * (saveExport), and editor links become onOpenProject handoffs. Conversion logic
 * (canvas, jsPDF, heic2any, pdf.js, tesseract) is unchanged — it already ran
 * client-side on the web.
 */

export function ToolRunner({ kind, onOpenProject }: { kind: ToolKind; onOpenProject: (id: string) => void }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [savedPath, setSavedPath] = useState<string | null>(null);
  const [w, setW] = useState(1080);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [chartData, setChartData] = useState("Q1: 40\nQ2: 65\nQ3: 52\nQ4: 88");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiTaskId, setAiTaskId] = useState<string | null>(null);
  const [vennLabels, setVennLabels] = useState("Food\nDrinks");
  /** View-lifetime flag: leaving the Tools view STOPS THE POLL but never the task —
   *  the generation keeps running (B7) and its lifecycle stays visible in the
   *  For Agents feed (lane "tool"). */
  const aliveRef = useRef(true);
  useEffect(() => () => { aliveRef.current = false; }, []);

  function dataUrlToBytes(dataUrl: string): Uint8Array {
    const [meta, b64] = dataUrl.split(",");
    void meta;
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return arr;
  }

  /** Native save dialog — the desktop replacement for the browser download anchor. */
  async function download(bytes: Uint8Array, name: string): Promise<void> {
    setError("");
    try {
      const res = await oia().saveExport(name, bytes);
      if (res.saved && res.path) setSavedPath(res.path);
      else setSavedPath(null); // user canceled — not an error
    } catch {
      setError("The file could not be saved. Please try again.");
    }
  }

  async function fileToImage(file: File): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
      return img;
    } finally {
      URL.revokeObjectURL(url); // safe to revoke once decode finished; <img> keeps its copy
    }
  }

  async function runConvert() {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true); setError(""); setSavedPath(null);
    try {
      const img = await fileToImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // jpg has no alpha
      ctx.drawImage(img, 0, 0);
      await download(dataUrlToBytes(canvas.toDataURL("image/jpeg", 0.92)), file.name.replace(/\.\w+$/, "") + ".jpg");
    } catch { setError("The image could not be converted. Please try another file."); } finally { setBusy(false); }
  }

  async function runToPdf() {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true); setError(""); setSavedPath(null);
    try {
      const img = await fileToImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? "landscape" : "portrait", unit: "px", format: [canvas.width, canvas.height] });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, canvas.width, canvas.height);
      await download(new Uint8Array(pdf.output("arraybuffer")), file.name.replace(/\.\w+$/, "") + ".pdf");
    } catch { setError("The PDF could not be created. Please try another file."); } finally { setBusy(false); }
  }

  async function runResize() {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true); setError(""); setSavedPath(null);
    try {
      const img = await fileToImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * w);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      await download(dataUrlToBytes(canvas.toDataURL("image/png")), `${w}px-${file.name}`);
    } catch { setError("The image could not be resized. Please try another file."); } finally { setBusy(false); }
  }

  function parseChartData(): { label: string; value: number }[] {
    return chartData.split("\n").map((l) => {
      const [label, v] = l.split(":");
      return { label: (label ?? "").trim(), value: Number((v ?? "0").trim()) || 0 };
    }).filter((d) => d.label);
  }

  async function runChart(kind: "bar" | "pie") {
    setBusy(true); setError(""); setSavedPath(null);
    try {
      const data = parseChartData();
      const W = 1000, H = 620;
      const canvas = document.createElement("canvas");
      canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      const palette = ["#7c3aed", "#ec4899", "#22d3ee", "#f59e0b", "#10b981", "#ef4444", "#3b82f6"];
      if (kind === "bar") {
        const max = Math.max(...data.map((d) => d.value), 1);
        const bw = (W - 160) / data.length;
        data.forEach((d, i) => {
          const h = (d.value / max) * (H - 200);
          ctx.fillStyle = palette[i % palette.length];
          ctx.fillRect(80 + i * bw + 20, H - 120 - h, bw - 40, h);
          ctx.fillStyle = "#18181b"; ctx.font = "14px Inter, sans-serif"; ctx.textAlign = "center";
          ctx.fillText(d.label, 80 + i * bw + bw / 2, H - 90);
          ctx.fillText(String(d.value), 80 + i * bw + bw / 2, H - 130 - h);
        });
      } else {
        const total = data.reduce((s, d) => s + d.value, 0) || 1;
        let angle = -Math.PI / 2;
        const cx = 300, cy = H / 2, r = 210;
        data.forEach((d, i) => {
          const slice = (d.value / total) * Math.PI * 2;
          ctx.beginPath();
          ctx.moveTo(cx, cy);
          ctx.arc(cx, cy, r, angle, angle + slice);
          ctx.closePath();
          ctx.fillStyle = palette[i % palette.length];
          ctx.fill();
          angle += slice;
        });
        // legend
        data.forEach((d, i) => {
          ctx.fillStyle = palette[i % palette.length];
          ctx.fillRect(600, 100 + i * 36, 18, 18);
          ctx.fillStyle = "#18181b"; ctx.font = "16px Inter, sans-serif"; ctx.textAlign = "left";
          ctx.fillText(`${d.label} — ${d.value}`, 628, 115 + i * 36);
        });
      }
      await download(dataUrlToBytes(canvas.toDataURL("image/png")), `chart-${kind}.png`);
    } catch { setError("The chart could not be created. Please check your data (one “label: value” per line)."); } finally { setBusy(false); }
  }

  /** Background submit + poll — never one long-lived RPC for a 1–6 min generation.
   *  Stops silently when the view unmounts (the task itself keeps running); a
   *  succeeded record WITHOUT a download is an error, never an empty result. */
  async function pollTask(taskId: string): Promise<string> {
    setAiTaskId(taskId);
    for (let i = 0; i < 240; i++) {
      if (!aliveRef.current) throw new Error("poll stopped — the view was closed (the task keeps running)");
      const t = await oia().getTask(taskId);
      if (!t) throw new Error("the task record is gone (expired or unknown)");
      if (t.progress === "succeeded") {
        const url = t.taskResult?.download;
        if (!url) throw new Error("the task finished without a result");
        return url;
      }
      if (t.progress === "failed") throw new Error(t.msg || "the task failed");
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("timed out waiting for the result");
  }

  async function runHeic(to: "png" | "pdf") {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true); setError(""); setSavedPath(null);
    try {
      const heic2any = (await import("heic2any")).default;
      const blobOrArr = await heic2any({ blob: file, toType: "image/png" });
      const blob: Blob = Array.isArray(blobOrArr) ? blobOrArr[0] : blobOrArr;
      if (to === "png") {
        await download(new Uint8Array(await blob.arrayBuffer()), file.name.replace(/\.\w+$/, "") + ".png");
        return;
      }
      const url = URL.createObjectURL(blob);
      try {
        const img = new Image(); await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
        const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext("2d")!.drawImage(img, 0, 0);
        const { jsPDF } = await import("jspdf");
        const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? "landscape" : "portrait", unit: "px", format: [canvas.width, canvas.height] });
        pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, canvas.width, canvas.height);
        await download(new Uint8Array(pdf.output("arraybuffer")), file.name.replace(/\.\w+$/, "") + ".pdf");
      } finally {
        URL.revokeObjectURL(url);
      }
    } catch { setError("The HEIC file could not be converted. Please try another photo."); } finally { setBusy(false); }
  }

  async function runPdfToJpg() {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true); setError(""); setSavedPath(null);
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      const buf = await file.arrayBuffer();
      const doc = await pdfjs.getDocument({ data: buf }).promise;
      const pages = Math.min(doc.numPages, 10);
      const urls: string[] = [];
      for (let i = 1; i <= pages; i++) {
        const page = await doc.getPage(i);
        const viewport = page.getViewport({ scale: 2 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width; canvas.height = viewport.height;
        await page.render({ canvas, canvasContext: canvas.getContext("2d")!, viewport }).promise;
        urls.push(canvas.toDataURL("image/jpeg", 0.92));
      }
      if (urls.length === 1) { await download(dataUrlToBytes(urls[0]), "page-1.jpg"); return; }
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      urls.forEach((u, i) => zip.file(`page-${i + 1}.jpg`, dataUrlToBytes(u)));
      await download(await zip.generateAsync({ type: "uint8array" }), "pdf-to-jpg.zip");
    } catch { setError("The PDF could not be rendered. Please try another file."); } finally { setBusy(false); }
  }

  async function runOcrEditor() {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true); setError("");
    try {
      // tesseract.js v7: the one-shot recognize() helper never passes output
      // options, so word-level data (blocks) stays OFF — the port from web read
      // res.data.words and got undefined. Use a worker and request blocks.
      const Tesseract = (await import("tesseract.js")).default;
      const worker = await Tesseract.createWorker("eng+vie");
      let words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[];
      try {
        const res = (await worker.recognize(file, {}, { blocks: true })) as unknown as {
          data: { blocks: { paragraphs: { lines: { words: typeof words }[] }[] }[] | null };
        };
        words = res.data.blocks?.flatMap((b) => b.paragraphs.flatMap((p) => p.lines.flatMap((l) => l.words))) ?? [];
      } finally {
        await worker.terminate();
      }
      const data = { words }; // the scene mapping below reads .words
      const bytes = new Uint8Array(await file.arrayBuffer());
      const up = await oia().uploadAsset(file.name, bytes);
      const objUrl = URL.createObjectURL(file);
      try {
        const img = new Image();
        await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = objUrl; });
        const W = 1360, H = Math.round((img.naturalHeight / img.naturalWidth) * W) || 2048;
        const scale = W / img.naturalWidth;
        const scene = {
          version: SCENE_VERSION,
          objects: [
            { type: "Rect", name: "clip", left: 0, top: 0, width: W, height: H, fill: "white", selectable: false, visible: true },
            { type: "Image", left: 0, top: 0, width: W, height: H, src: up.url, crossOrigin: "anonymous", selectable: true, visible: true },
            ...data.words.slice(0, 80).map((word: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }) => ({
              type: "Textbox", text: word.text, left: Math.round(word.bbox.x0 * scale), top: Math.round(word.bbox.y0 * scale),
              width: Math.max(60, Math.round((word.bbox.x1 - word.bbox.x0) * scale)), height: 40,
              fontFamily: "Inter", fontSize: Math.max(14, Math.round((word.bbox.y1 - word.bbox.y0) * scale)),
              fill: "#111827", editable: true, selectable: true, visible: true,
            })),
          ],
        };
        const p = await oia().createProject({ name: file.name + " (editable)", scene });
        onOpenProject(p.id);
      } finally {
        URL.revokeObjectURL(objUrl);
      }
    } catch (e) { setError("The text could not be recognized — " + String(e).slice(0, 160)); } finally { setBusy(false); }
  }

  /** ONE busy/error owner for both AI tools — param building (upload included)
   *  happens inside, so failure paths cannot double-manage state. */
  async function runAiTask(type: "generate-poster" | "image-edit", buildParams: () => Promise<Record<string, unknown>>) {
    setError(""); setAiResult(null); setAiTaskId(null); setBusy(true);
    try {
      const params = await buildParams();
      const t = await oia().submitTask(type, params);
      const url = await pollTask(t.taskId);
      setAiResult(url);
    } catch (e) {
      if (!aliveRef.current) return; // view gone — nothing to render
      const message = e instanceof Error ? e.message : String(e);
      // G3: the shared metered slot is held (chat or agent run) — honest, retryable
      setError(message.includes("already running")
        ? "A generation is already running (chat or another tool). Wait for it to finish and try again."
        : `The task failed: ${message}`);
      setAiResult(null);
    } finally {
      if (aliveRef.current) { setBusy(false); setAiTaskId(null); }
    }
  }

  function runAiGenerate() {
    if (!aiPrompt.trim()) return;
    void runAiTask("generate-poster", async () => ({
      prompt: `${aiPrompt}, YouTube banner style, wide 16:9`, size: "1536x1024", noWait: false, source: "web",
    }));
  }
  function runAiEdit() {
    const file = fileRef.current?.files?.[0];
    if (!aiPrompt.trim()) return;
    if (!file) { setError("Choose a photo first, then describe the hairstyle you want."); return; }
    void runAiTask("image-edit", async () => {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const up = await oia().uploadAsset(file.name, bytes);
      return { reference: [up.url], prompt: aiPrompt, noWait: false, source: "web" };
    });
  }

  /** Stop the in-flight generation — every paid path must be cancellable (hard rule 6). */
  async function stopAi() {
    if (!aiTaskId) return;
    try {
      await oia().cancelTask(aiTaskId);
    } catch {
      setError("The task could not be cancelled — it will finish on its own.");
    }
  }

  async function openResultInEditor() {
    if (!aiResult) return;
    setError("");
    try {
      const scene = {
        version: SCENE_VERSION,
        objects: [
          { type: "Rect", name: "clip", left: 0, top: 0, width: 1536, height: 1024, fill: "white", selectable: false, visible: true },
          { type: "Image", left: 0, top: 0, width: 1536, height: 1024, src: aiResult, crossOrigin: "anonymous", selectable: true, visible: true },
        ],
      };
      const p = await oia().createProject({ name: aiPrompt.slice(0, 40) || "AI result", scene });
      onOpenProject(p.id);
    } catch { setError("The editor could not be opened. Please try again."); }
  }

  function parseVenn(): { labels: string[] } {
    const rows = vennLabels.split("\n").map((l) => { const [a] = l.split(":"); return (a ?? "").trim(); }).filter(Boolean);
    return { labels: rows };
  }

  async function runVenn() {
    setBusy(true); setError(""); setSavedPath(null);
    try {
      const { labels } = parseVenn();
      const n = Math.min(3, Math.max(2, labels.length));
      const W = 1000, H = 700;
      const canvas = document.createElement("canvas"); canvas.width = W; canvas.height = H;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, W, H);
      const palette = ["rgba(124,58,237,.45)", "rgba(236,72,153,.45)", "rgba(34,211,238,.45)"];
      const r = 200, cx = W / 2, cy = H / 2;
      const centers = n === 2 ? [[cx - 90, cy], [cx + 90, cy]] : [[cx - 100, cy - 60], [cx + 100, cy - 60], [cx, cy + 80]];
      centers.slice(0, n).forEach(([x, y], i) => {
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = palette[i]; ctx.fill();
        ctx.strokeStyle = "#18181b"; ctx.lineWidth = 2; ctx.stroke();
        ctx.fillStyle = "#18181b"; ctx.font = "bold 20px Inter, sans-serif"; ctx.textAlign = "center";
        const lx = n === 2 ? (i === 0 ? cx - 260 : cx + 260) : [cx - 300, cx + 300, cx][i];
        ctx.fillText(labels[i] ?? String.fromCharCode(65 + i), lx, i === 2 && n === 3 ? cy + 250 : cy - 250);
      });
      await download(dataUrlToBytes(canvas.toDataURL("image/png")), "venn.png");
    } catch { setError("The diagram could not be created. Please check your labels."); } finally { setBusy(false); }
  }

  if (kind === "landing") {
    return <p className="hintP">This tool is not available yet. Explore the other tools in the Toolbox.</p>;
  }

  return (
    <div className="toolRunner">
      {(kind === "convert-image" || kind === "image-to-pdf" || kind === "resize") && (
        <>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" />
          {kind === "resize" && (
            <div className="toolRow">
              <label htmlFor="resize-width">Width (px): </label>
              <input id="resize-width" type="number" value={w} min={16} max={4096} onChange={(e) => setW(Number(e.target.value))} style={{ width: 100, padding: 6 }} />
            </div>
          )}
          <button className="primaryBtn" disabled={busy} onClick={() => kind === "convert-image" ? runConvert() : kind === "image-to-pdf" ? runToPdf() : runResize()}>
            {busy ? "Processing…" : "Convert & save"}
          </button>
        </>
      )}

      {(kind === "heic-to-png" || kind === "heic-to-pdf") && (
        <>
          <input ref={fileRef} type="file" accept="image/heic,image/heif,.heic,.heif" />
          <button className="primaryBtn" disabled={busy} onClick={() => runHeic(kind === "heic-to-png" ? "png" : "pdf")}>
            {busy ? "Converting…" : kind === "heic-to-png" ? "HEIC → PNG" : "HEIC → PDF"}
          </button>
        </>
      )}

      {kind === "pdf-to-jpg" && (
        <>
          <input ref={fileRef} type="file" accept="application/pdf" />
          <button className="primaryBtn" disabled={busy} onClick={runPdfToJpg}>
            {busy ? "Rendering…" : "PDF to JPG (up to 10 pages, ZIP)"}
          </button>
        </>
      )}

      {kind === "ocr-editor" && (
        <>
          <input ref={fileRef} type="file" accept="image/*" />
          <button className="primaryBtn" disabled={busy} onClick={runOcrEditor}>
            {busy ? "Recognizing text…" : "Extract text & open editor"}
          </button>
        </>
      )}

      {(kind === "ai-generate" || kind === "ai-edit") && (
        <>
          {kind === "ai-edit" && <input ref={fileRef} type="file" accept="image/*" />}
          <textarea value={aiPrompt} rows={3} onChange={(e) => setAiPrompt(e.target.value)}
            placeholder={kind === "ai-generate" ? "Describe your design, e.g. a coffee review channel, warm colors, THE DAILY BREW" : "Describe the hairstyle you would like to try, e.g. short curls or an undercut"} />
          <div className="toolRow">
            {busy ? (
              <>
                <span className="hintP" role="status">Creating — this can take a few minutes…</span>
                <button className="secondaryBtn" onClick={() => void stopAi()}>Stop</button>
              </>
            ) : (
              <button className="primaryBtn" onClick={() => kind === "ai-generate" ? runAiGenerate() : runAiEdit()} disabled={!aiPrompt.trim()}>
                {kind === "ai-generate" ? "Generate design" : "Try hairstyle"}
              </button>
            )}
          </div>
          {aiResult && (
            <div className="aiResult">
              <img src={toDisplayUrl(aiResult)} alt="Generated result" />
              <button className="primaryBtn" onClick={() => void openResultInEditor()}>Open in editor</button>
            </div>
          )}
        </>
      )}

      {kind === "venn" && (
        <>
          <textarea value={vennLabels} rows={3} onChange={(e) => setVennLabels(e.target.value)} style={{ fontFamily: "monospace" }} aria-label="Venn diagram labels" />
          <button className="primaryBtn" disabled={busy} onClick={runVenn}>{busy ? "Creating…" : "Create Venn diagram"}</button>
        </>
      )}

      {(kind === "chart-bar" || kind === "chart-pie") && (
        <>
          <textarea value={chartData} onChange={(e) => setChartData(e.target.value)} rows={5} style={{ fontFamily: "monospace" }} aria-label="Chart data (label: value per line)" />
          <button className="primaryBtn" disabled={busy} onClick={() => runChart(kind === "chart-bar" ? "bar" : "pie")}>
            {busy ? "Creating…" : "Create chart"}
          </button>
        </>
      )}

      {error && <div className="notice error" role="alert">{error}</div>}
      {savedPath && <p className="hintP" role="status">Saved to {savedPath}</p>}
    </div>
  );
}
