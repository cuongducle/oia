import { useEffect, useState } from "react";
import type * as fabricNS from "fabric";

/**
 * Re-render a panel when the canvas changes under it. The editor's Fabric
 * listeners outlive React renders, so panels that read the live stack (Layers,
 * Design, the contextual toolbar) subscribe themselves instead of mirroring
 * Fabric state into the Editor component.
 */
const STACK_EVENTS = [
  "selection:created", "selection:updated", "selection:cleared",
  "object:added", "object:removed", "object:modified", "canvas:cleared",
] as const;
const MOTION_EVENTS = ["object:moving", "object:scaling", "object:rotating", "object:resizing"] as const;

export function useCanvasRev(canvas: fabricNS.Canvas | null, withMotion = false): number {
  const [rev, setRev] = useState(0);
  useEffect(() => {
    if (!canvas) return;
    const bump = () => setRev((r) => r + 1);
    const events = withMotion ? [...STACK_EVENTS, ...MOTION_EVENTS] : STACK_EVENTS;
    // SAFETY: every name above is a fabric CanvasEvents key; the tuple loses that literal union when spread.
    for (const e of events) canvas.on(e as keyof fabricNS.CanvasEvents, bump);
    return () => { for (const e of events) canvas.off(e as keyof fabricNS.CanvasEvents, bump); };
  }, [canvas, withMotion]);
  return rev;
}

/** One commit path for every panel edit: Fabric's own modified event drives undo + autosave. */
export function commitObject(canvas: fabricNS.Canvas, obj: fabricNS.FabricObject, patch: Record<string, unknown>): void {
  obj.set(patch);
  obj.setCoords();
  canvas.requestRenderAll();
  canvas.fire("object:modified", { target: obj });
}
