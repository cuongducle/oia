import { app, type BrowserWindow } from "electron";
import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * The busy-state capture gate (UI v1.1 R3): photographs the run-progress sheet
 * mid-run — Home AND the Editor AI dock, the two surfaces RunSteps paints.
 *
 * How the tempo is made photographable: NOT by intercepting events (a hold in
 * UtilityClient was tried and reverted — test hooks do not belong in the wire
 * client), but by pacing the mock pair itself (OIA_MOCK_STEP_DELAY_MS, injected
 * via contextEnv in this mode only). The REAL pipeline runs, just slow enough
 * to poll-and-shoot. The run must still complete — a capture that broke the
 * flow would photograph a lie (B7's UI cousin).
 *
 * Dev build only (F2, releaseGate pins the env flag); mock pair only — the
 * default-deny rule in resolveEffectiveMode forces mock for every
 * OIA_DESKTOP_* test flag.
 *
 * Exit codes: 2 bridge missing · 3 submit failed · 9 Home snap missed ·
 * 10 run did not complete · 11 editor snap missed.
 */

const here = path.dirname(fileURLToPath(import.meta.url));

/** One 350ms-paced provider call ⇒ each phase stays on screen for well over a
 *  poll interval; the whole mock run still finishes in a few seconds. */
const POLL_MS = 25;
/** Let the pulse animation land mid-ring before the settled grab. */
const SNAP_SETTLE_MS = 250;
const RUN_TIMEOUT_MS = 30_000;
const HOME_PROMPT = "labor day cold brew flash sale banner";

export interface ShotBusyDeps {
  registerAssetProtocol: () => void;
  createWindow: () => BrowserWindow;
}

export async function runShotBusy(deps: ShotBusyDeps): Promise<void> {
  const { registerAssetProtocol, createWindow } = deps;
  registerAssetProtocol();
  const win = createWindow();
  win.webContents.on("console-message", (_e, _lvl, message) => {
    if (/error|fail|refused|denied/i.test(message)) console.log("[shot-busy renderer]", message.slice(0, 200));
  });
  await waitForLoad(win);
  const hasBridge = await js(win, "typeof window.oia");
  if (hasBridge !== "object") {
    console.error("[shot-busy] bridge missing — preload failed");
    app.exit(2);
    return;
  }
  // macOS throttles an unfocused window's compositor — capturePage would hand
  // back a stale pre-run frame. Keep presenting; never steal the user's focus.
  win.webContents.setBackgroundThrottling(false);

  // ---- Home: the user's frame (a done phase, a paid phase in flight, notes open) ----
  const submitted = await submitPrompt(win, HOME_PROMPT);
  if (submitted !== true) {
    console.error(`[shot-busy] submit failed: ${submitted}`);
    app.exit(3);
    return;
  }
  const homeSnap = await pollAndCapture(win, {
    name: "desktop-busy.png",
    ready: (s) => Boolean(s.running && s.doneCount >= 1 && !s.result && s.notesOpen),
    timeoutMs: RUN_TIMEOUT_MS,
  });
  if (!homeSnap.snapped) {
    console.error(`[shot-busy] never reached the mid-run frame (last: ${homeSnap.lastState})`);
    app.exit(9);
    return;
  }
  const finished = await waitFor(win, (s) => Boolean(s.done), RUN_TIMEOUT_MS);
  if (!finished) {
    console.error("[shot-busy] the run did not complete after the capture");
    app.exit(10);
    return;
  }
  console.log("[shot-busy] Home OK");

  // ---- Editor AI dock: same stepper vocabulary, second surface ----
  await js(win, `document.querySelector('[data-testid="open-editor"]')?.click() ?? 'missing'`);
  const editorReady = await waitFor(win, (s) => s.editorCanvas, RUN_TIMEOUT_MS);
  if (!editorReady) {
    console.error("[shot-busy] editor never mounted the artboard");
    app.exit(11);
    return;
  }
  const edited = await js(win, `(() => {
    const ta = document.querySelector('.aiComposer textarea');
    if (!ta) return 'no composer';
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'make the headline bolder');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = document.querySelector('.aiComposerControls .generateBtn');
    if (!btn || btn.disabled) return 'send disabled';
    btn.click();
    return true;
  })()`);
  if (edited !== true) {
    console.error(`[shot-busy] editor AI submit failed: ${edited}`);
    app.exit(11);
    return;
  }
  const dockSnap = await pollAndCapture(win, {
    name: "desktop-editor-busy.png",
    ready: (s) => Boolean(s.dockRunning && s.dockNarrative),
    timeoutMs: RUN_TIMEOUT_MS,
  });
  if (!dockSnap.snapped) {
    console.error(`[shot-busy] editor dock never showed a running step (last: ${dockSnap.lastState})`);
    app.exit(11);
    return;
  }
  const editorDone = await waitFor(win, (s) => !s.dockRunning && Boolean(s.dockNarrative), RUN_TIMEOUT_MS);
  if (!editorDone) {
    console.error("[shot-busy] the editor AI run did not settle after the capture");
    app.exit(11);
    return;
  }
  console.log("DESKTOP_SHOT_BUSY OK");
  app.exit(0);
}

/** Everything the poll needs, in one page probe. */
interface BusyProbe {
  running: string | null;
  doneCount: number;
  result: boolean;
  notesOpen: boolean;
  done: boolean;
  editorCanvas: boolean;
  dockRunning: string | null;
  dockNarrative: string;
}

const PROBE = `(() => ({
  running: document.querySelector('.runStep.running')?.textContent ?? null,
  doneCount: document.querySelectorAll('.runStep.done').length,
  result: Boolean(document.querySelector('.result canvas')),
  notesOpen: document.querySelector('.aiNotes')?.open ?? false,
  done: Boolean(document.querySelector('.genSummary')),
  editorCanvas: Boolean(document.querySelector('[data-testid="editor-root"] .canvasWrap canvas')),
  dockRunning: document.querySelector('.aiPanelFloating .runStep.running')?.textContent ?? null,
  dockNarrative: document.querySelector('.aiPanelFloating .narrative')?.textContent.slice(0, 40) ?? "",
}))()`;

function js<T = unknown>(win: BrowserWindow, code: string): Promise<T> {
  return win.webContents.executeJavaScript(code, true).catch((e) => `ERR ${String(e)}` as unknown as T);
}

function waitForLoad(win: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    win.webContents.once("did-finish-load", () => resolve());
    win.webContents.once("did-fail-load", (_e, code, desc) => {
      console.error(`[shot-busy] DID-FAIL-LOAD ${code} ${desc}`);
      resolve();
    });
    setTimeout(resolve, 15_000);
  });
}

/** Type the prompt and click Create — the same path a user drives. */
async function submitPrompt(win: BrowserWindow, prompt: string): Promise<true | string> {
  return js<true | string>(win, `(() => {
    const ta = document.querySelector('[data-testid="design-idea"]');
    if (!ta) return 'no composer';
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, ${JSON.stringify(prompt)});
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = document.querySelector('[data-testid="create-btn"]');
    if (!btn || btn.disabled) return 'create disabled';
    btn.click();
    return true;
  })()`);
}

async function waitFor(win: BrowserWindow, pred: (s: BusyProbe) => boolean, timeoutMs: number): Promise<boolean> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const s = await js<BusyProbe>(win, PROBE);
    if (pred(s)) return true;
    await sleep(POLL_MS);
  }
  return false;
}

async function pollAndCapture(
  win: BrowserWindow,
  opts: { name: string; ready: (s: BusyProbe) => boolean; timeoutMs: number },
): Promise<{ snapped: boolean; lastState: string }> {
  const deadline = Date.now() + opts.timeoutMs;
  let lastState = "";
  while (Date.now() < deadline) {
    const s = await js<BusyProbe>(win, PROBE);
    lastState = JSON.stringify(s);
    if (opts.ready(s)) {
      await sleep(SNAP_SETTLE_MS);
      await win.capturePage(); // the first grab can be a stale compositor frame
      await sleep(POLL_MS * 4);
      const image = await win.capturePage();
      const { writeFile, mkdir } = await import("node:fs/promises");
      await mkdir(path.join(here, "../..", "out"), { recursive: true });
      await writeFile(path.join(here, "../..", "out", opts.name), image.toPNG());
      const meta = await js(win, `JSON.stringify({
        order: [...document.querySelectorAll('.runStep')].map((n) => n.className.replace('runStep ', '') + ':' + n.textContent.trim()),
        panel: (() => { const r = document.querySelector('.runPanel')?.getBoundingClientRect(); return r ? [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)] : null; })(),
        dpr: window.devicePixelRatio ?? 1,
      })`).catch(() => "{}");
      console.log(`[shot-busy] wrote out/${opts.name} · ${meta}`);
      return { snapped: true, lastState };
    }
    await sleep(POLL_MS);
  }
  return { snapped: false, lastState };
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
