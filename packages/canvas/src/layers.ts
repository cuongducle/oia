/**
 * Layer stack operations for the editor's Layers panel and contextual toolbar
 * (UI v1.1 R4). Index 0 is the bottom of the Fabric stack; the artboard `clip`
 * Rect is the page itself and must stay beneath every layer — "send to back"
 * means "just above the clip", never under it (that hid the layer entirely).
 *
 * `locked` is a scene property (whitelisted in createEditor like `origin`):
 * Fabric does not serialize selectable/evented, so a lock expressed only through
 * them was lost on every save, undo and page switch.
 */

export interface LayerObject {
  type?: string;
  name?: string;
  text?: string;
  src?: string;
  origin?: string | null;
  visible?: boolean;
  locked?: boolean;
  selectable?: boolean;
  evented?: boolean;
}

export interface LayerCanvas<O extends LayerObject = LayerObject> {
  getObjects(): O[];
  moveObjectTo(obj: O, index: number): unknown;
}

export interface LayerRow {
  /** Index in the Fabric stack (0 = bottom). */
  index: number;
  label: string;
  kind: "text" | "image" | "group" | "shape";
  visible: boolean;
  locked: boolean;
  /** TP.10: user-added layers survive AI refinement — the panel says so. */
  user: boolean;
}

export const isClip = (o: LayerObject): boolean => o.name === "clip";

export function layerKind(o: LayerObject): LayerRow["kind"] {
  const t = (o.type ?? "").toLowerCase();
  if (t === "textbox" || t === "i-text" || t === "text") return "text";
  if (t === "image" || typeof o.src === "string") return "image";
  if (t === "group" || t === "activeselection") return "group";
  return "shape";
}

/** Planner roles ride `name`; text falls back to its first words, the rest to the kind. */
export function layerLabel(o: LayerObject): string {
  if (o.name && o.name !== "clip") return o.name;
  if (typeof o.text === "string" && o.text.trim()) return o.text.trim().replace(/\s+/g, " ").slice(0, 40);
  const kind = layerKind(o);
  return kind === "image" ? "Image" : kind === "group" ? "Group" : kind === "text" ? "Text" : `${(o.type ?? "Shape").replace(/^./, (c) => c.toUpperCase())}`;
}

/** Top of the stack first — the order a Layers panel reads. The clip is not a layer. */
export function layerRows(objects: LayerObject[]): LayerRow[] {
  const rows: LayerRow[] = [];
  objects.forEach((o, index) => {
    if (isClip(o)) return;
    rows.push({ index, label: layerLabel(o), kind: layerKind(o), visible: o.visible !== false, locked: o.locked === true, user: (o.origin ?? "user") === "user" });
  });
  return rows.reverse();
}

/** Lowest index a layer may occupy: just above the clip (or 0 when there is none). */
export function floorIndex(objects: LayerObject[]): number {
  const clip = objects.findIndex(isClip);
  return clip < 0 ? 0 : clip + 1;
}

/** Move a layer to a stack index, clamped to [floor, top]. Returns the index it landed on. */
export function moveLayer<O extends LayerObject>(canvas: LayerCanvas<O>, obj: O, index: number): number {
  const objects = canvas.getObjects();
  const target = Math.max(floorIndex(objects), Math.min(objects.length - 1, index));
  canvas.moveObjectTo(obj, target);
  return target;
}

export type LayerAction = "layerFront" | "layerForward" | "layerBackward" | "layerBack";

/** The four stack orders, expressed on the canvas (fabric 7 has no per-object bringToFront). */
export function applyLayerAction<O extends LayerObject>(canvas: LayerCanvas<O>, obj: O, action: LayerAction): number {
  const objects = canvas.getObjects();
  const at = objects.indexOf(obj);
  if (at < 0) return at;
  switch (action) {
    case "layerFront": return moveLayer(canvas, obj, objects.length - 1);
    case "layerForward": return moveLayer(canvas, obj, at + 1);
    case "layerBackward": return moveLayer(canvas, obj, at - 1);
    case "layerBack": return moveLayer(canvas, obj, floorIndex(objects));
  }
}

/** Lock = not selectable or hit-testable on the canvas; the Layers panel still reaches it. */
export function setLocked(obj: LayerObject, locked: boolean): void {
  obj.locked = locked || undefined;
  obj.selectable = !locked;
  obj.evented = !locked;
}

/** Re-derive selectable/evented from the persisted `locked` flag after any loadFromJSON. */
export function applyLocks(objects: LayerObject[]): void {
  for (const o of objects) if (!isClip(o) && o.locked) setLocked(o, true);
}
