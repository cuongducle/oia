import { SCENE_VERSION, type Template } from "@oia/schema";
import { STUDIO_TEMPLATES } from "./studio-templates.js";
import { LIVESTREAM_TEMPLATES } from "./livestream-presets.js";

/** Native overlays stay transparent and editable, not flattened preview images. */
const OVERLAY_TEMPLATES: Template[] = [
  {
    id: "studio-overlay-host", name: "Host introduction · Lower third", authorName: "Oia Studio",
    featured: true, tipCredits: 0, createdAt: 0, category: "overlay",
    scene: { version: SCENE_VERSION, objects: [
      { type: "Rect", name: "clip", left: 0, top: 0, width: 1920, height: 1080, fill: "transparent", selectable: false },
      { type: "Rect", left: 100, top: 780, width: 720, height: 188, fill: "#172b27", rx: 8, ry: 8 },
      { type: "Rect", left: 100, top: 780, width: 8, height: 188, fill: "#d6f28b" },
      { type: "Textbox", text: "LINH NGUYEN", left: 144, top: 814, width: 620, fontFamily: "Be Vietnam Pro", fontSize: 48, fontWeight: 700, fill: "#ffffff" },
      { type: "Textbox", text: "Founder, Lumea Studio", left: 144, top: 886, width: 620, fontFamily: "Be Vietnam Pro", fontSize: 28, fill: "#d6f28b" },
    ] },
  },
  {
    id: "studio-overlay-offer", name: "Shop offer · Corner banner", authorName: "Oia Studio",
    featured: true, tipCredits: 0, createdAt: 0, category: "overlay",
    scene: { version: SCENE_VERSION, objects: [
      { type: "Rect", name: "clip", left: 0, top: 0, width: 1920, height: 1080, fill: "transparent", selectable: false },
      { type: "Rect", left: 1120, top: 100, width: 700, height: 228, fill: "#fff5df", rx: 8, ry: 8 },
      { type: "Rect", left: 1120, top: 100, width: 700, height: 8, fill: "#ad3f27" },
      { type: "Textbox", text: "WEEKEND SPECIAL", left: 1160, top: 136, width: 620, fontFamily: "Be Vietnam Pro", fontSize: 26, charSpacing: 90, fill: "#ad3f27", fontWeight: 600 },
      { type: "Textbox", text: "20% OFF", left: 1160, top: 183, width: 620, fontFamily: "Be Vietnam Pro", fontSize: 64, fontWeight: 800, fill: "#27251e" },
      { type: "Textbox", text: "Use code WEEKEND at checkout", left: 1160, top: 274, width: 620, fontFamily: "Be Vietnam Pro", fontSize: 25, fill: "#574a3c" },
    ] },
  },
];

export const BUNDLED_TEMPLATES: readonly Template[] = [...STUDIO_TEMPLATES, ...LIVESTREAM_TEMPLATES, ...OVERLAY_TEMPLATES];
