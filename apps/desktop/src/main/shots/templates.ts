import type { BrowserWindow } from "electron";
import { TEMPLATE_CATEGORIES } from "@oia/schema";
import { BUNDLED_TEMPLATES } from "../../shared/bundled-templates.js";

/** Exercise taxonomy in the actual Home view, not a second implementation of the filter. */
export async function shotTemplates(win: BrowserWindow): Promise<void> {
  for (const category of TEMPLATE_CATEGORIES) {
    const expected = BUNDLED_TEMPLATES.filter((t) => t.category === category.id).map((t) => t.name);
    const result = await win.webContents.executeJavaScript(`(async () => {
      const button = [...document.querySelectorAll('.gallerySubTabs button')].find((b) => b.textContent === ${JSON.stringify(category.label)});
      if (!button) return { ok: false, reason: 'missing category' };
      button.click();
      await new Promise((r) => setTimeout(r, 100));
      const cards = [...document.querySelectorAll('[aria-labelledby="gallery-title"] .galleryCard')];
      const names = cards.map((c) => c.getAttribute('aria-label')?.replace(/^Open template /, ''));
      const wrongCategory = cards.some((c) => !c.querySelector('.galleryMeta span')?.textContent.startsWith(${JSON.stringify(category.label + " ·")}));
      return { ok: !wrongCategory && ${JSON.stringify(expected)}.every((n) => names.includes(n)), names };
    })()`, true);
    if (!result?.ok) throw new Error(`Template category ${category.id}: ${JSON.stringify(result)}`);
  }
  await win.webContents.executeJavaScript(`document.querySelector('.gallerySubTabs button').click()`, true);
  console.log("[shot] template taxonomy: every bundled category discoverable, no category leakage");
}
