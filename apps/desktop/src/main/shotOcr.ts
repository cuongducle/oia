import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { app, type BrowserWindow } from "electron";

/**
 * Opt-in shot scenario (OIA_SHOT_OCR=1) — proves the CSP allowances for the OCR
 * tool end to end: tesseract.js spawns a blob: worker, importScripts's its
 * script and fetches core+lang data from cdn.jsdelivr.net (first run only).
 * A CSP regression here surfaces as the tool's friendly error, not a console —
 * so the only honest gate is a REAL recognize→upload→project→editor run.
 * Network-dependent (CDN), which is why it is not part of the default gate;
 * it runs on the nightly workflow (ocr-nightly.yml) so it cannot rot silently.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/** "SALE 50" (Arial Bold, black on white, 600×200) — a fixture, kept with tests. */
export function fixturePngB64(): string {
  const bytes = readFileSync(path.resolve(here, "../../test/fixtures/ocr-sale50.png"));
  return bytes.toString("base64");
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

type OcrProjectFile = { name?: string; pages?: { canvas?: { objects?: { type?: string; text?: string }[] } }[] };

export async function runOcrScenario(win: Electron.BrowserWindow): Promise<{ ok: boolean; detail: unknown }> {
  // Tools → the OCR card (registry name: "AI Image Editor", kind ocr-editor)
  await win.webContents.executeJavaScript(
    `(() => { [...document.querySelectorAll(".viewNav .navPill")].find((p) => p.textContent.trim() === "Tools")?.click(); return true; })()`,
    true,
  );
  await sleep(500);
  const cardFound = await win.webContents.executeJavaScript(
    `(() => { const c = [...document.querySelectorAll(".toolCard")].find((c) => c.textContent.includes("AI Image Editor")); c?.click(); return Boolean(c); })()`,
    true,
  );
  await sleep(500);
  // Inject the fixture into the hidden file input (no native dialog in a gate)
  const injected = await win.webContents.executeJavaScript(
    `(async () => {
      const input = document.querySelector(".toolRunner input[type=file]");
      if (!input) return "no-input";
      const bytes = Uint8Array.from(atob("${fixturePngB64()}"), (c) => c.charCodeAt(0));
      const file = new File([bytes], "sale50.png", { type: "image/png" });
      const dt = new DataTransfer();
      dt.items.add(file);
      input.files = dt.files;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      return "ok";
    })()`,
    true,
  );
  let runClicked = false;
  for (let i = 0; i < 20 && !runClicked; i++) {
    runClicked = await win.webContents.executeJavaScript(
      `(() => { const b = document.querySelector(".toolRunner .primaryBtn"); if (!b || b.disabled) return false; b.click(); return true; })()`,
      true,
    ).catch(() => false);
    if (!runClicked) await sleep(300);
  }
  // The recognizer needs the CDN on first run — allow a long tail, poll until
  // the editor opens (project created) or the tool gives up with its alert.
  let verify: { ok: boolean; editor?: boolean; name?: string; canvasOk?: boolean; err?: string } | null = null;
  for (let i = 0; i < 150 && !verify; i++) {
    await sleep(1000);
    verify = await win.webContents.executeJavaScript(
      `(() => {
        if (document.querySelector('[data-testid="editor-root"]')) {
          const name = document.querySelector(".edTop .nameInput")?.value ?? "";
          const canvasOk = Boolean(document.querySelector(".canvasWrap canvas"));
          return { ok: canvasOk && name.includes("(editable)"), editor: true, name, canvasOk };
        }
        const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
        return err ? { ok: false, err } : null;
      })()`,
      true,
    ).catch(() => null);
  }
  // The page verify proves the pipeline ran; the WORDS prove recognition.
  // The editor keeps its scene private, but the project autosaves to the store
  // (shot mode runs on a temp userData) — count Textbox objects straight from disk.
  let wordCount = -1;
  const objectsSeen: { t: string; s: string }[] = [];
  try {
    const dir = path.join(app.getPath("userData"), "data", "projects");
    const { readdir, readFile } = await import("node:fs/promises");
    const files = await readdir(dir);
    const texts = await Promise.all(
      files.filter((f) => f.endsWith(".json")).map((f) => readFile(path.join(dir, f), "utf8").catch(() => "")),
    );
    // One unreadable/corrupt project file must NOT fail this gate for the wrong
    // reason — parse per file, skip the broken ones (the store quarantines those).
    const projects = texts.flatMap((t) => {
      try {
        return [JSON.parse(t) as OcrProjectFile];
      } catch {
        return [];
      }
    });
    const proj = projects.find((p) => p.name?.includes("(editable)"));
    const objects = proj?.pages?.[0]?.canvas?.objects ?? [];
    objectsSeen.push(...objects.map((o) => ({ t: o.type ?? "?", s: (o.text ?? "").slice(0, 12) })));
    wordCount = objects.filter((o) => o.type === "Textbox").length;
  } catch { /* count stays -1 → fail */ }
  console.log("[shot] ocr project objects:", JSON.stringify(objectsSeen));
  return { ok: Boolean(cardFound && injected === "ok" && runClicked && verify?.ok && wordCount > 0), detail: { cardFound, injected, runClicked, verify, wordCount } };
}
