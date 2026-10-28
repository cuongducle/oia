"use client";

import { useRef, useState } from "react";
import type { ToolKind } from "@/libs/tools-registry";

export function ToolRunner({ kind, slug }: { kind: ToolKind; slug: string }) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [resultUrl, setResultUrl] = useState<string | null>(null);
  const [w, setW] = useState(1080);
  const [busy, setBusy] = useState(false);
  const [chartData, setChartData] = useState("Q1: 40\nQ2: 65\nQ3: 52\nQ4: 88");
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [vennLabels, setVennLabels] = useState("Food\nDrinks");
  const [editorLink, setEditorLink] = useState<string | null>(null);

  function download(url: string, name: string) {
    const a = document.createElement("a");
    a.href = url; a.download = name; a.click();
    setResultUrl(url);
  }

  async function fileToImage(file: File): Promise<HTMLImageElement> {
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise((r, j) => { img.onload = r; img.onerror = j; img.src = url; });
    return img;
  }

  async function runConvert() {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const img = await fileToImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      const ctx = canvas.getContext("2d")!;
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, canvas.width, canvas.height); // jpg has no alpha
      ctx.drawImage(img, 0, 0);
      download(canvas.toDataURL("image/jpeg", 0.92), file.name.replace(/\.\w+$/, "") + ".jpg");
    } finally { setBusy(false); }
  }

  async function runToPdf() {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const img = await fileToImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? "landscape" : "portrait", unit: "px", format: [canvas.width, canvas.height] });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, canvas.width, canvas.height);
      download(URL.createObjectURL(pdf.output("blob")), file.name.replace(/\.\w+$/, "") + ".pdf");
    } finally { setBusy(false); }
  }

  async function runResize() {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const img = await fileToImage(file);
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = Math.round((img.naturalHeight / img.naturalWidth) * w);
      canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
      download(canvas.toDataURL("image/png"), `${w}px-${file.name}`);
    } finally { setBusy(false); }
  }

  function parseChartData(): { label: string; value: number }[] {
    return chartData.split("\n").map((l) => {
      const [label, v] = l.split(":");
      return { label: (label ?? "").trim(), value: Number((v ?? "0").trim()) || 0 };
    }).filter((d) => d.label);
  }

  async function runChart(kind: "bar" | "pie") {
    setBusy(true);
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
      download(canvas.toDataURL("image/png"), `chart-${kind}.png`);
    } finally { setBusy(false); }
  }

  function blobToDataUrl(blob: Blob): Promise<string> {
    return new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result as string); r.readAsDataURL(blob); });
  }
  async function pollTask(taskId: string): Promise<string> {
    for (let i = 0; i < 120; i++) {
      const j = await (await fetch(`/api/tasks/${taskId}`)).json();
      if (j.data?.progress === "succeeded") return j.data.taskResult.download as string;
      if (j.data?.progress === "failed") throw new Error(j.data.msg || "task failed");
      await new Promise((r) => setTimeout(r, 2000));
    }
    throw new Error("timeout");
  }
  async function runHeic(to: "png" | "pdf") {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const heic2any = (await import("heic2any")).default;
      const blobOrArr = await heic2any({ blob: file, toType: "image/png" });
      const blob: Blob = Array.isArray(blobOrArr) ? blobOrArr[0] : blobOrArr;
      if (to === "png") { download(URL.createObjectURL(blob), file.name.replace(/\.\w+$/, "") + ".png"); return; }
      const url = await blobToDataUrl(blob);
      const img = new Image(); await new Promise((r) => { img.onload = r; img.src = url; });
      const canvas = document.createElement("canvas"); canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
      canvas.getContext("2d")!.drawImage(img, 0, 0);
      const { jsPDF } = await import("jspdf");
      const pdf = new jsPDF({ orientation: canvas.width > canvas.height ? "landscape" : "portrait", unit: "px", format: [canvas.width, canvas.height] });
      pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, canvas.width, canvas.height);
      download(URL.createObjectURL(pdf.output("blob")), file.name.replace(/\.\w+$/, "") + ".pdf");
    } finally { setBusy(false); }
  }
  async function runPdfToJpg() {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const pdfjs = await import("pdfjs-dist");
      pdfjs.GlobalWorkerOptions.workerSrc = "/vendor/pdf.worker.min.mjs";
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
      if (urls.length === 1) { download(urls[0], "page-1.jpg"); return; }
      const JSZip = (await import("jszip")).default;
      const zip = new JSZip();
      urls.forEach((u, i) => zip.file(`page-${i + 1}.jpg`, dataUrlToBlobPublic(u)));
      download(URL.createObjectURL(await zip.generateAsync({ type: "blob" })), "pdf-to-jpg.zip");
    } finally { setBusy(false); }
  }
  function dataUrlToBlobPublic(dataUrl: string): Blob {
    const [meta, b64] = dataUrl.split(",");
    const mime = meta.match(/:(.*?);/)?.[1] ?? "application/octet-stream";
    const bin = atob(b64); const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  async function runOcrEditor() {
    const file = fileRef.current?.files?.[0]; if (!file) return;
    setBusy(true);
    try {
      const Tesseract = (await import("tesseract.js")).default;
      const res = (await Tesseract.recognize(file, "eng+vie")) as unknown as { data: { words: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }[] } };
      const data = res.data;
    // upload the source image
      const fd = new FormData(); fd.set("file", file);
      const up = await (await fetch("/api/upload/direct", { method: "POST", body: fd })).json();
      const img = new Image(); const objUrl = URL.createObjectURL(file);
      await new Promise((r) => { img.onload = r; img.src = objUrl; });
      const W = 1360, H = Math.round((img.naturalHeight / img.naturalWidth) * W) || 2048;
      const scale = W / img.naturalWidth;
      const scene = {
        version: "7.3.1",
        objects: [
          { type: "Rect", name: "clip", left: 0, top: 0, width: W, height: H, fill: "white", selectable: false, visible: true },
          { type: "Image", left: 0, top: 0, width: W, height: H, src: up.data.url, crossOrigin: "anonymous", selectable: true, visible: true },
          ...data.words.slice(0, 80).map((w: { text: string; bbox: { x0: number; y0: number; x1: number; y1: number } }) => ({
            type: "Textbox", text: w.text, left: Math.round(w.bbox.x0 * scale), top: Math.round(w.bbox.y0 * scale),
            width: Math.max(60, Math.round((w.bbox.x1 - w.bbox.x0) * scale)), height: 40,
            fontFamily: "Inter", fontSize: Math.max(14, Math.round((w.bbox.y1 - w.bbox.y0) * scale)),
            fill: "#111827", editable: true, selectable: true, visible: true,
          })),
        ],
      };
      const j = await (await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: file.name + " (editable)", scene }) })).json();
      if (j.code === 0) setEditorLink(`/editor?id=${j.data.id}`);
    } finally { setBusy(false); }
  }
  async function runAiGenerate() {
    if (!aiPrompt.trim()) return;
    setBusy(true); setAiResult(null); setEditorLink(null);
    try {
      const j = await (await fetch("/api/tasks/generate-poster", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ prompt: `${aiPrompt}, YouTube banner style, wide 16:9`, size: "1536x1024", noWait: true, source: "web" }),
      })).json();
      const url = await pollTask(j.data.taskId);
      setAiResult(url);
    } catch (e) { setAiResult(null); alert(String(e)); }
    finally { setBusy(false); }
  }
  async function runAiEdit() {
    const file = fileRef.current?.files?.[0];
    if (!file || !aiPrompt.trim()) return;
    setBusy(true); setAiResult(null); setEditorLink(null);
    try {
      const fd = new FormData(); fd.set("file", file);
      const up = await (await fetch("/api/upload/direct", { method: "POST", body: fd })).json();
      const j = await (await fetch("/api/tasks/image-edit", {
        method: "POST", headers: { "content-type": "application/json" },
        body: JSON.stringify({ reference: [up.data.url], prompt: aiPrompt, noWait: true, source: "web" }),
      })).json();
      const url = await pollTask(j.data.taskId);
      setAiResult(url);
    } catch (e) { setAiResult(null); alert(String(e)); }
    finally { setBusy(false); }
  }
  async function openResultInEditor() {
    if (!aiResult) return;
    const scene = {
      version: "7.3.1",
      objects: [
        { type: "Rect", name: "clip", left: 0, top: 0, width: 1536, height: 1024, fill: "white", selectable: false, visible: true },
        { type: "Image", left: 0, top: 0, width: 1536, height: 1024, src: aiResult.startsWith("http") ? aiResult : aiResult, crossOrigin: "anonymous", selectable: true, visible: true },
      ],
    };
    const j = await (await fetch("/api/projects", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: aiPrompt.slice(0, 40) || "AI result", scene }) })).json();
    if (j.code === 0) window.location.href = `/editor?id=${j.data.id}`;
  }
  function parseVenn(): { labels: string[]; values: number[] } {
    const rows = vennLabels.split("\n").map((l) => { const [a, b] = l.split(":"); return { label: (a ?? "").trim(), value: Number((b ?? "0").trim()) || 0 }; }).filter((r) => r.label);
    return { labels: rows.map((r) => r.label), values: rows.map((r) => r.value) };
  }
  async function runVenn() {
    setBusy(true);
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
      download(canvas.toDataURL("image/png"), "venn.png");
    } finally { setBusy(false); }
  }

  if (kind === "landing") {
    return <p className="hintP">This tool is not available yet. Explore the other tools in the Toolbox.</p>;
  }

  return (
    <div style={{ marginTop: 20 }}>
      {(kind === "convert-image" || kind === "image-to-pdf" || kind === "resize") && (
        <>
          <input ref={fileRef} type="file" accept="image/png,image/jpeg" />
          {kind === "resize" && (
            <div style={{ margin: "10px 0" }}>
              <label>Width (px): </label>
              <input type="number" value={w} min={16} max={4096} onChange={(e) => setW(Number(e.target.value))} style={{ width: 100, padding: 6 }} />
            </div>
          )}
          <button className="primaryBtn" disabled={busy} onClick={() => kind === "convert-image" ? runConvert() : kind === "image-to-pdf" ? runToPdf() : runResize()}>
            {busy ? "Processing…" : "Convert & download"}
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
          {editorLink && <p className="hintP"> <a href={editorLink}>Open project with editable text layers →</a></p>}
        </>
      )}

      {(kind === "ai-generate" || kind === "ai-edit") && (
        <>
          {kind === "ai-edit" && <input ref={fileRef} type="file" accept="image/*" />}
          <textarea value={aiPrompt} rows={3} onChange={(e) => setAiPrompt(e.target.value)}
            placeholder={kind === "ai-generate" ? "Describe your design, e.g. a coffee review channel, warm colors, THE DAILY BREW" : "Describe the hairstyle you would like to try, e.g. short curls or an undercut"}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--line)" }} />
          <button className="primaryBtn" onClick={() => kind === "ai-generate" ? runAiGenerate() : runAiEdit()} disabled={busy || !aiPrompt.trim()}>
            {busy ? "Creating…" : kind === "ai-generate" ? "Generate design" : "Try hairstyle"}
          </button>
          {aiResult && (
            <div style={{ marginTop: 12 }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={aiResult} alt="Generated result" style={{ width: "100%", borderRadius: 10, border: "1px solid var(--line)" }} />
              <button className="primaryBtn" style={{ marginTop: 8 }} onClick={openResultInEditor}> Open in editor</button>
            </div>
          )}
        </>
      )}

      {kind === "venn" && (
        <>
          <textarea value={vennLabels} rows={3} onChange={(e) => setVennLabels(e.target.value)}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--line)", fontFamily: "monospace" }} />
          <button className="primaryBtn" disabled={busy} onClick={runVenn}>{busy ? "Creating…" : "Create Venn diagram"}</button>
        </>
      )}

      {(kind === "chart-bar" || kind === "chart-pie") && (
        <>
          <textarea value={chartData} onChange={(e) => setChartData(e.target.value)} rows={5}
            style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid var(--line)", fontFamily: "monospace" }} />
          <button className="primaryBtn" disabled={busy} onClick={() => runChart(kind === "chart-bar" ? "bar" : "pie")}>
            {busy ? "Creating…" : "Create chart"}
          </button>
        </>
      )}

      {resultUrl && <p className="hintP" style={{ marginTop: 10 }}> Your file is ready. <a href={resultUrl} download>Download again</a></p>}
    </div>
  );
}
