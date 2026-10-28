"use client";

import { useEffect, useRef, useState } from "react";
import type { SceneCanvas } from "@oia/schema";
import type { StaticCanvas } from "fabric";

/** Render the actual editable scene, not its first image layer or a decorative placeholder. */
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
        const clip = scene.objects.find(o => o.name === "clip") ?? scene.objects.find(o => o.type === "Rect");
        const w = clip?.width || 1360, h = clip?.height || 2048;
        const renderW = 480, z = renderW / w;
        canvas = new fabric.StaticCanvas(ref.current, { width: renderW, height: Math.round(h * z), renderOnAddRemove: false });
        const font = getComputedStyle(document.body).fontFamily.split(",")[0].replaceAll('"', "");
        const objects = scene.objects.map(o => o.fontFamily === "Be Vietnam Pro" ? { ...o, fontFamily: font } : o);
        await canvas.loadFromJSON({ ...scene, objects });
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
