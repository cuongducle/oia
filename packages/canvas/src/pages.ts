import { SCENE_VERSION, type SceneCanvas } from "@oia/schema";

/**
 * Multi-page behavior:
 * - Pages are numbered from 1; at least one page always remains
 * - "+" appends a blank page after the current one
 * - "Designing board N/T" — board switcher theo index
 * - Each page stores its own scene JSON
 */
export interface EditorPage {
  id: string;
  canvas: SceneCanvas;
}

let seq = 0;
export function newPageId(): string {
  seq += 1;
  return `page_${Date.now().toString(36)}_${seq}`;
}

export function blankScene(width: number, height: number): SceneCanvas {
  return {
    version: SCENE_VERSION,
    objects: [
      { type: "Rect", name: "clip", left: 0, top: 0, width, height, fill: "white", selectable: false, hasControls: false, visible: true },
    ],
  };
}

export function createPages(width = 1360, height = 2048): EditorPage[] {
  return [{ id: newPageId(), canvas: blankScene(width, height) }];
}

/** BR-PG1: append a blank page and return the new state + index. */
export function addPage(pages: EditorPage[], width = 1360, height = 2040): { pages: EditorPage[]; activeIndex: number } {
  const next = [...pages, { id: newPageId(), canvas: blankScene(width, height) }];
  return { pages: next, activeIndex: next.length - 1 };
}

/** BR-PG2: remove a page — the last page can never be deleted. */
export function removePage(pages: EditorPage[], index: number): { pages: EditorPage[]; activeIndex: number } {
  if (pages.length <= 1) return { pages, activeIndex: 0 };
  const next = pages.filter((_, i) => i !== index);
  const activeIndex = Math.min(index, next.length - 1);
  return { pages: next, activeIndex };
}

/** BR-PG3: duplicate a page — copied scene, new id, inserted right after the source. */
export function duplicatePage(pages: EditorPage[], index: number): { pages: EditorPage[]; activeIndex: number } {
  const src = pages[index];
  const copy: EditorPage = { id: newPageId(), canvas: JSON.parse(JSON.stringify(src.canvas)) };
  const next = [...pages.slice(0, index + 1), copy, ...pages.slice(index + 1)];
  return { pages: next, activeIndex: index + 1 };
}

/** Switch to a valid page index (clamped). */
export function switchTo(pages: EditorPage[], index: number): number {
  return Math.max(0, Math.min(index, pages.length - 1));
}

/** BR-ED3'': "Apply size to all pages" — resize every page: clip Rect + per-page width/height. */
export function applySizeToAllPages(
  pages: EditorPage[],
  width: number,
  height: number,
): EditorPage[] {
  return pages.map((p) => {
    const canvas = JSON.parse(JSON.stringify(p.canvas)) as SceneCanvas;
    canvas.objects = canvas.objects.filter(Boolean);
    const clip = canvas.objects.find((o) => o?.name === "clip" && o?.type === "Rect");
    if (clip) {
      clip.width = width;
      clip.height = height;
    } else {
      canvas.objects.unshift({ type: "Rect", name: "clip", left: 0, top: 0, width, height, fill: "white", selectable: false, visible: true } as never);
    }
    return { ...p, width, height, canvas };
  });
}
