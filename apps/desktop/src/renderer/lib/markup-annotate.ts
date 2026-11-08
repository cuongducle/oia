/**
 * ME (markup-edit.md) — "circle to edit": annotation strokes captured over the
 * selected image layer, stored in the layer's NATURAL pixel space so pan/zoom/
 * object transforms never distort them, then composited flat onto the artwork
 * for the codex channel's flatten-mode markup edit (probe P3, 2026-11-08).
 *
 * Pure math lives here without importing fabric — matrices are plain arrays so
 * the mapping is unit-testable; only `markupComposite` touches the DOM canvas.
 */

export interface Point {
  x: number;
  y: number;
}

export type Stroke = Point[];

/** Invert a 2D affine matrix [a,b,c,d,e,f] (fabric's layout). */
function invert(m: number[]): number[] {
  const [a, b, c, d, e, f] = m;
  const det = a * d - b * c;
  if (!det) return [1, 0, 0, 1, 0, 0];
  return [d / det, -b / det, -c / det, a / det, (c * f - d * e) / det, (b * e - a * f) / det];
}

function apply(m: number[], p: Point): Point {
  return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

/**
 * Viewport (screen) point → natural-image pixels.
 * viewport → scene (inverse viewportTransform) → object-local (inverse object
 * matrix) → natural px (object width/height map onto the natural bitmap).
 */
export function viewportToNatural(
  v: Point,
  viewportTransform: number[],
  objectMatrix: number[],
  objWidth: number,
  objHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): Point {
  const scene = apply(invert(viewportTransform), v);
  const local = apply(invert(objectMatrix), scene);
  return {
    x: (local.x / objWidth) * naturalWidth,
    y: (local.y / objHeight) * naturalHeight,
  };
}

/** Natural-image pixels → viewport point (for drawing the overlay). */
export function naturalToViewport(
  n: Point,
  viewportTransform: number[],
  objectMatrix: number[],
  objWidth: number,
  objHeight: number,
  naturalWidth: number,
  naturalHeight: number,
): Point {
  const local = { x: (n.x / naturalWidth) * objWidth, y: (n.y / naturalHeight) * objHeight };
  const scene = apply(objectMatrix, local);
  return apply(viewportTransform, scene);
}

/** Marker width: ~1.5% of the short side, floored so thin banners stay visible. */
export function markerWidthFor(naturalWidth: number, naturalHeight: number): number {
  return Math.max(3, Math.round(0.015 * Math.min(naturalWidth, naturalHeight)));
}

/**
 * Composite the annotation strokes onto the artwork at natural size and return
 * a PNG data URL. This is the flatten-mode payload: referenceImages[0] of the
 * edit request. Red is the probe-verified marker color — not configurable in v1.
 */
export function markupComposite(
  src: string,
  strokes: Stroke[],
  naturalWidth: number,
  naturalHeight: number,
): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    // oia:// is cross-origin from the page: without anonymous CORS the canvas
    // taints and toDataURL throws INSIDE onload — the promise would hang forever.
    // Same rule fabric uses when loading scene objects (main/index.ts protocol).
    img.crossOrigin = "anonymous";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = naturalWidth;
        canvas.height = naturalHeight;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("markup composite: no 2d context"));
          return;
        }
        ctx.drawImage(img, 0, 0, naturalWidth, naturalHeight);
        ctx.strokeStyle = "#ff0000";
        ctx.lineWidth = markerWidthFor(naturalWidth, naturalHeight);
        ctx.lineCap = "round";
        ctx.lineJoin = "round";
        for (const stroke of strokes) {
          if (stroke.length < 2) {
            if (stroke.length === 1) {
              // a tap still leaves a dot — better a visible dot than a lost tap
              const p = stroke[0];
              ctx.beginPath();
              ctx.arc(p.x, p.y, ctx.lineWidth / 2, 0, Math.PI * 2);
              ctx.fillStyle = "#ff0000";
              ctx.fill();
            }
            continue;
          }
          ctx.beginPath();
          ctx.moveTo(stroke[0].x, stroke[0].y);
          for (let i = 1; i < stroke.length; i++) ctx.lineTo(stroke[i].x, stroke[i].y);
          ctx.stroke();
        }
        resolve(canvas.toDataURL("image/png"));
      } catch (err) {
        reject(err instanceof Error ? err : new Error("markup composite: export failed"));
      }
    };
    img.onerror = () => reject(new Error("markup composite: artwork failed to load"));
    img.src = src;
  });
}
