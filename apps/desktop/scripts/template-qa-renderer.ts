import { StaticCanvas } from "fabric";
import { fabricV6OriginDefaults, normalizeImageScales } from "@oia/canvas";
import { BUNDLED_TEMPLATES } from "../src/shared/bundled-templates.js";

fabricV6OriginDefaults();
Object.assign(window, {
  templateIds: BUNDLED_TEMPLATES.map((t) => t.id),
  async renderTemplate(id: string) {
    const template = BUNDLED_TEMPLATES.find((t) => t.id === id);
    if (!template) throw new Error(`Unknown template: ${id}`);
    await Promise.all([200, 400, 500, 600, 700, 800].map((weight) => document.fonts.load(`${weight} 32px "Be Vietnam Pro"`, "Giảm giá Tết")));
    const clip = template.scene.objects.find((o) => o.name === "clip");
    const width = Number(clip?.width), height = Number(clip?.height);
    const canvas = new StaticCanvas(document.createElement("canvas"), { width, height, enableRetinaScaling: false });
    try {
      const objects = template.scene.objects.map((o) => typeof o.src === "string"
        ? { ...o, src: new URL(`public${o.src}`, document.baseURI).href } : o);
      await canvas.loadFromJSON({ ...template.scene, objects });
      normalizeImageScales(canvas);
      canvas.renderAll();
      const text = canvas.getObjects().filter((o) => o.type === "textbox");
      const bounds = text.map((o) => ({ ...o.getBoundingRect(), name: o.toObject().text }));
      const overflow = bounds.filter((r) => r.left < 0 || r.top < 0 || r.left + r.width > width + 1 || r.top + r.height > height + 1);
      const collisions = bounds.flatMap((a, i) => bounds.slice(i + 1).filter((b) =>
        Math.min(a.left + a.width, b.left + b.width) - Math.max(a.left, b.left) > 2 &&
        Math.min(a.top + a.height, b.top + b.height) - Math.max(a.top, b.top) > 2,
      ).map((b) => [a.name, b.name]));
      return { id, category: template.category, width, height, overflow, collisions, png: canvas.toDataURL({ format: "png", multiplier: 1 }) };
    } finally { await canvas.dispose(); }
  },
});
