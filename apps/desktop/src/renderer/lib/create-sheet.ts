import { DEFAULT_POSTER, SIZE_PRESETS } from "@oia/canvas";
import type { Project, SceneCanvas } from "@oia/schema";
import { oia } from "./bridge.js";
import { LIVE_ARTBOARDS, liveArtboardScene, type LiveArtboard } from "./livestream-presets.js";

/**
 * UI v1.1 R2: the Create sheet's "Start from a size" lane: marketplace sizes
 * (SIZE_PRESETS), the C3 livestream artboards, and the everyday formats, grouped
 * the way sellers name them. Only the two C3 covers are `official` (LV-10),
 * marketplace sizes follow seller guides, never "the platform requires".
 */

export interface SizeGroup { name: string; items: LiveArtboard[] }

function size(id: string, label: string, projectName: string, dims: { width: number; height: number }): LiveArtboard {
  return { id, label, sub: `${dims.width} × ${dims.height}`, projectName, w: dims.width, h: dims.height, transparent: false, official: false };
}

export const CREATE_SIZES: SizeGroup[] = [
  {
    name: "Marketplace",
    items: [
      size("shopee-1x1", "Shopee 1:1", "Shopee product", SIZE_PRESETS["Shopee Product (1:1)"]),
      size("lazada-1x1", "Lazada 1:1", "Lazada product", SIZE_PRESETS["Lazada Product (1:1)"]),
      size("tiktokshop-1x1", "TikTok Shop 1:1", "TikTok Shop product", SIZE_PRESETS["TikTok Shop Product (1:1)"]),
    ],
  },
  {
    name: "Social",
    items: [
      size("tiktok-916", "TikTok 9:16", "TikTok post", SIZE_PRESETS["TikTok (9:16)"]),
      size("post-4x5", "Post 4:5", "Social post", { width: 1080, height: 1350 }),
      size("instagram-1x1", "Instagram 1:1", "Instagram post", SIZE_PRESETS["Instagram Post (1:1)"]),
      size("facebook-191", "Facebook 1.91:1", "Facebook post", SIZE_PRESETS["Facebook Post (1.91:1)"]),
    ],
  },
  { name: "Livestream", items: LIVE_ARTBOARDS },
  {
    name: "Other",
    items: [
      size("poster", "Poster", "Poster", DEFAULT_POSTER),
      size("presentation-169", "Presentation 16:9", "Presentation", SIZE_PRESETS["Presentation (16:9)"]),
      size("youtube-thumb", "YouTube thumbnail", "YouTube thumbnail", SIZE_PRESETS["YouTube Thumbnail (16:9)"]),
      size("a4", "A4", "A4 page", SIZE_PRESETS["A4 (1:1.41)"]),
    ],
  },
];

export function sizeScene(a: LiveArtboard): SceneCanvas {
  return liveArtboardScene(a);
}

/** "Use as background" (free): the image becomes page 1 on a matching clip. */
export async function projectFromImage(file: File): Promise<Project> {
  const up = await oia().uploadAsset(file.name, new Uint8Array(await file.arrayBuffer()));
  const { w, h } = await imageSize(file);
  return oia().createProject({
    name: file.name.replace(/\.[^.]+$/, "") || "Image design",
    scene: {
      version: "6.9.1",
      objects: [
        { type: "Rect", name: "clip", left: 0, top: 0, width: w, height: h, fill: "white", selectable: false },
        { type: "Image", left: 0, top: 0, width: w, height: h, src: up.url, crossOrigin: "anonymous", selectable: true },
      ],
    },
  });
}

/** Natural size, falling back to the default poster when the browser cannot decode it. */
function imageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    const done = (w: number, h: number) => { URL.revokeObjectURL(url); resolve({ w, h }); };
    img.onload = () => done(img.naturalWidth || DEFAULT_POSTER.width, img.naturalHeight || DEFAULT_POSTER.height);
    img.onerror = () => done(DEFAULT_POSTER.width, DEFAULT_POSTER.height);
    img.src = url;
  });
}
