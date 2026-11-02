import { useEffect, useRef, useState } from "react";
import type { SceneCanvas } from "@oia/schema";
import type { StaticCanvas } from "fabric";
import { mapAssetUrls } from "../../shared/assets.js";
import { fabricV6OriginDefaults, normalizeImageScales } from "@oia/canvas";

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
        fabricV6OriginDefaults(); // before loadFromJSON constructs objects (see editor.ts)
        const mapped = mapAssetUrls(scene);
        const clip = mapped.objects.find(o => o.name === "clip") ?? mapped.objects.find(o => o.type === "Rect");
        const w = clip?.width || 1360, h = clip?.height || 2048;
        // Render at NATURAL size with an identity viewport (fabric 7's zoom/retina
        // transform chain drew manual-zoom renders at a fraction of the canvas — the
        // workspace thumbnails shipped quarter-size and half-clipped until the owner
        // caught it visually). CSS scales the element into the card (contain).
        const cap = 1600; // memory guard for extreme artboards (bitmap ≈ cap²×4 bytes)
        const size = previewRenderSize(w, h, cap);
        canvas = new fabric.StaticCanvas(ref.current, {
          width: size.width, height: size.height,
          renderOnAddRemove: false,
        });
        const objects = mapped.objects.map(o => o.fontFamily === "Be Vietnam Pro" ? { ...o, fontFamily: fontStack() } : o);
        await canvas.loadFromJSON({ ...mapped, objects });
        if (disposed) return;
        normalizeImageScales(canvas); // thumbnails paint the full box (mock plates, mismatched uploads)
        if (size.zoom < 1) {
          canvas.viewportTransform = [size.zoom, 0, 0, size.zoom, 0, 0];
        }
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

/** Thumbnail render size: natural size, capped (memory ≈ cap²×4 bytes; a 4096px
 *  artboard must not allocate a 134MB bitmap per card). Pure — unit-tested. */
export function previewRenderSize(w: number, h: number, cap = 1600): { width: number; height: number; zoom: number } {
  const zoom = Math.min(1, cap / Math.max(w, h));
  return { width: Math.round(w * zoom), height: Math.round(h * zoom), zoom };
}

/** The bundled body stack (Be Vietnam Pro ships offline — the persona's diacritics render). */
function fontStack(): string {
  return getComputedStyle(document.body).fontFamily.split(",")[0].replaceAll('"', "");
}
