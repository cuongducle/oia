import type { BrowserWindow } from "electron";
import { app } from "electron";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

/**
 * Opt-in shot scenario (OIA_SHOT_OCR=1) — proves the CSP allowances for the OCR
 * tool end to end: tesseract.js spawns a blob: worker, importScripts's its
 * script and fetches core+lang data from cdn.jsdelivr.net (first run only).
 * A CSP regression here surfaces as the tool's friendly error, not a console —
 * so the only honest gate is a REAL recognize→upload→project→editor run.
 * Network-dependent (CDN), which is why it is not part of the default gate.
 */

/** PNG fixture: "SALE 50" in Arial Bold, black on white, 600×200. */
const FIXTURE_PNG_B64 =
  "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";

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

export async function runOcrScenario(win: BrowserWindow): Promise<{ ok: boolean; detail: unknown }> {
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
      const bytes = Uint8Array.from(atob("${FIXTURE_PNG_B64}"), (c) => c.charCodeAt(0));
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
  try {
    const dir = path.join(app.getPath("userData"), "data", "projects");
    const files = await readdir(dir);
    const texts = await Promise.all(files.filter((f) => f.endsWith(".json")).map((f) => readFile(path.join(dir, f), "utf8").catch(() => "")));
    const proj = texts
      .map((t) => JSON.parse(t) as { name?: string; pages?: { canvas?: { objects?: { type?: string; text?: string }[] } }[] })
      .find((p) => p.name?.includes("(editable)"));
    wordCount = (proj?.pages?.[0]?.canvas?.objects ?? []).filter((o) => o.type === "Textbox").length;
    if (process.env.OIA_SHOT_OCR === "1")
      console.log("[shot] ocr project objects:", JSON.stringify((proj?.pages?.[0]?.canvas?.objects ?? []).map((o) => ({ t: o.type, s: (o.text ?? "").slice(0, 12) }))));
  } catch { /* count stays -1 → fail */ }
  return { ok: Boolean(cardFound && injected === "ok" && runClicked && verify?.ok && wordCount > 0), detail: { cardFound, injected, runClicked, verify, wordCount } };
}
