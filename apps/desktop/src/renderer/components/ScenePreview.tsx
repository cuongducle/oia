import { useEffect, useRef, useState } from "react";
import type { SceneCanvas } from "@oia/schema";
import type { StaticCanvas } from "fabric";
import { mapAssetUrls } from "../../shared/assets.js";

/** Render the actual editable scene (not its first image layer) — port of the web
 *  ScenePreview with the oia:// mapping the desktop canvas needs. */
export function ScenePreview({ scene, label, className = "" }: { scene: SceneCanvas; label: string; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const host = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let disposed = false;
    setReady(false); setFailed(false);
    let canvas: StaticCanvas | undefined;
    const observer = new IntersectionObserver(async entries => {
      if (!entries.some(e => e.isIntersecting)) return;
      observer.disconnect();
      try {
        const [fabric] = await Promise.all([import("fabric"), document.fonts.ready]);
        if (disposed || !ref.current) return;
        const mapped = mapAssetUrls(scene);
        const clip = mapped.objects.find(o => o.name === "clip") ?? mapped.objects.find(o => o.type === "Rect");
        const w = clip?.width || 1360, h = clip?.height || 2048;
        const renderW = 480, z = renderW / w;
        canvas = new fabric.StaticCanvas(ref.current, { width: renderW, height: Math.round(h * z), renderOnAddRemove: false });
        const objects = mapped.objects.map(o => o.fontFamily === "Be Vietnam Pro" ? { ...o, fontFamily: fontStack() } : o);
        await canvas.loadFromJSON({ ...mapped, objects });
        if (disposed) return;
        canvas.setZoom(z);
        canvas.renderAll();
        setReady(true);
      } catch { if (!disposed) setFailed(true); }
    }, { rootMargin: "200px" });
    if (host.current) observer.observe(host.current);
    return () => { disposed = true; observer.disconnect(); void canvas?.dispose(); };
  }, [scene]);
  return <div ref={host} className={`scenePreview ${className}`} role="img" aria-label={label} data-ready={ready}>
    <canvas ref={ref} aria-hidden="true" />
    {failed && <span className="previewFailure">Preview unavailable</span>}
  </div>;
}

/** The bundled body stack (Be Vietnam Pro ships offline — the persona's diacritics render). */
function fontStack(): string {
  return getComputedStyle(document.body).fontFamily.split(",")[0].replaceAll('"', "");
}
