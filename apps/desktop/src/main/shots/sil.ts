import { app, type BrowserWindow } from "electron";

/**
 * SIL lane (single-image-loop.md): the Edit loop view end to end - canvas-first
 * empty state, one generate through the real composer, numbered marks drawn via
 * the pointer path, the single-round multi-region edit, undo/latest/compare, and
 * the polish lane (keyboard tools, selection delete, 12 regions). Extracted from
 * index.ts (deliberate-debt item) so the shot file stops growing and the SIL
 * gates become reviewable in one place.
 */
export async function shotSil(win: BrowserWindow, snap: (win: BrowserWindow, name: string) => Promise<void>): Promise<void> {
  // ---- SL-1: the Edit loop view generates ONE image
  // through the real composer path (pages=1, no outline gate), flattens the
  // canvas answer to a single <img>, and offers Save PNG. Mock pair, like Home. ----
  console.log("[shot] opening Edit loop…");
  await win.webContents.executeJavaScript(`(() => {
    const pills = [...document.querySelectorAll(".viewNav .navPill")];
    const loop = pills.find((p) => p.textContent.trim() === "Edit loop");
    if (!loop) return false;
    loop.click();
    return true;
  })()`, true);
  let loopReady = false;
  for (let i = 0; i < 20; i++) {
    loopReady = await win.webContents.executeJavaScript(`Boolean(document.querySelector('[data-testid="loop-idea"]'))`, true);
    if (loopReady) break;
    await new Promise((r) => setTimeout(r, 150));
  }
  // canvas-first (owner 18/11): with NO image yet the stage is the empty
  // canvas (Krea/Midjourney layout), not a composer card
  const loopEmpty = await win.webContents.executeJavaScript(`Boolean(document.querySelector('[data-testid="loop-empty"] h1'))`, true);
  if (!loopReady || !loopEmpty) {
    console.error("DESKTOP_SHOT SIL FAILED, loop view did not mount");
    app.exit(31);
    return;
  }
  // artifact: the canvas-first empty state (pre-generate) before the run mutates the view
  await snap(win, "desktop-loop-empty.png");
  const silSubmitted = await win.webContents.executeJavaScript(`(() => {
    const ta = document.querySelector('[data-testid="loop-idea"]');
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(ta, 'loop smoke one image banner trà sữa');
    ta.dispatchEvent(new Event('input', { bubbles: true }));
    const btn = document.querySelector('[data-testid="loop-generate"]');
    if (!btn || btn.disabled) return 'generate missing/disabled';
    btn.click();
    return 'submitted';
  })()`, true);
  if (silSubmitted !== "submitted") {
    console.error(`DESKTOP_SHOT SIL FAILED, could not submit (${silSubmitted})`);
    app.exit(31);
    return;
  }
  let silImg: { src: string; w: number; h: number; save: boolean; reset: boolean; meta: string; err: string } | null = null;
  for (let i = 0; i < 60; i++) {
    silImg = await win.webContents.executeJavaScript(`(() => {
      const img = document.querySelector('[data-testid="loop-image"]');
      if (!img) return null;
      return {
        src: img.src.slice(0, 22),
        w: img.naturalWidth,
        h: img.naturalHeight,
        save: Boolean(document.querySelector('[data-testid="loop-save"]')),
        reset: Boolean(document.querySelector('[data-testid="loop-reset"]')),
        meta: document.querySelector('.loopMeta')?.textContent ?? '',
        err: [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(' '),
      };
    })()`, true);
    if (silImg) break;
    await new Promise((r) => setTimeout(r, 250));
  }
  if (!silImg || !silImg.src.startsWith("data:image/png") || silImg.w < 1 || !silImg.save || !silImg.reset || silImg.err) {
    console.error(`DESKTOP_SHOT SIL FAILED, the loop image never landed (${JSON.stringify(silImg)})`);
    app.exit(31);
    return;
  }
  // one job ⇒ one version: auto-refine re-yields canvases, later candidates
  // must REPLACE the job's slot, never stack ("Edit 3" on a first generate
  // was the live bug this pins)
  if (!silImg.meta.includes("Generated") || /Edit \d/.test(silImg.meta)) {
    console.error(`DESKTOP_SHOT SIL FAILED, version meta wrong for a single job (${JSON.stringify(silImg.meta)})`);
    app.exit(31);
    return;
  }
  console.log(`[shot] SIL generate OK (${silImg.w}x${silImg.h} flat PNG on the stage, meta "${silImg.meta}")`);

  // SL-2: draw one box + one arrow with the REAL pointer path, then verify the
  // overlay painted red AND the region panel numbered them. rAF throttle needs
  // a foreground window (the ME lane found a covered window paints nothing).
  if (process.platform === "darwin") app.focus({ steal: true });
  win.restore();
  win.moveTop();
  win.focus();
  await new Promise((r) => setTimeout(r, 400));
  const silMarks = await win.webContents.executeJavaScript(`(async () => {
    // SL-4 first-use hint must show on a fresh profile BEFORE any mark exists
    const hint = Boolean(document.querySelector('[data-testid="loop-first-hint"]'));
    const boxBtn = document.querySelector('[data-testid="tool-box"]');
    if (!boxBtn) return { ok: false, why: "no box tool" };
    boxBtn.click();
    await new Promise((r) => setTimeout(r, 150));
    const ovRaw = document.querySelector('[data-testid="loop-overlay"]');
    if (!ovRaw) return { ok: false, why: "no overlay" };
    const ov = ovRaw.closest(".canvas-container")?.querySelector(".upper-canvas") ?? ovRaw;
    const img = document.querySelector('[data-testid="loop-image"]');
    if (!img || !img.getAttribute("width")) return { ok: false, why: "image not fitted yet" };
    const r = ov.getBoundingClientRect();
    const ir = img.getBoundingClientRect();
    const cx = ir.left + ir.width / 2, cy = ir.top + ir.height / 2;
    const base = { bubbles: true, cancelable: true, pointerId: 11, isPrimary: true, pointerType: "mouse" };
    const drag = async (x0, y0, x1, y1) => {
      ov.dispatchEvent(new PointerEvent("pointerdown", { ...base, clientX: x0, clientY: y0 }));
      for (let i = 1; i <= 8; i++) ov.dispatchEvent(new PointerEvent("pointermove", { ...base, clientX: x0 + (x1 - x0) * i / 8, clientY: y0 + (y1 - y0) * i / 8 }));
      ov.dispatchEvent(new PointerEvent("pointerup", { ...base, clientX: x1, clientY: y1 }));
      await new Promise((res) => setTimeout(res, 120));
    };
    await drag(cx - ir.width * 0.2, cy - ir.height * 0.1, cx + ir.width * 0.15, cy + ir.height * 0.05);
    document.querySelector('[data-testid="tool-arrow"]').click();
    await new Promise((r) => setTimeout(r, 150));
    await drag(cx - ir.width * 0.4, cy + ir.height * 0.2, cx - ir.width * 0.1, cy + ir.height * 0.1);
    await new Promise((res) => setTimeout(res, 250));
    const rows = [...document.querySelectorAll(".loopRegion")].map((n) => n.dataset.testid);
    const chip1 = document.querySelector('[data-testid="region-1"] .regionChip')?.textContent;
    const chip2 = document.querySelector('[data-testid="region-2"] .regionChip')?.textContent;
    // pixel truth: red marker pixels in a crop around the box path (native
    // res, DPR-aware). Fabric paints objects on the LOWER canvas; the upper
    // one only carries interaction/controls.
    const lower = ovRaw;
    const dpr = lower.width / Math.max(1, r.width);
    const t = document.createElement("canvas");
    const wCss = ir.width * 0.45, hCss = ir.height * 0.25, x0css = cx - r.left - ir.width * 0.22, y0css = cy - r.top - ir.height * 0.12;
    t.width = Math.round(wCss * dpr); t.height = Math.round(hCss * dpr);
    t.getContext("2d").drawImage(lower, Math.round(x0css * dpr), Math.round(y0css * dpr), t.width, t.height, 0, 0, t.width, t.height);
    const d = t.getContext("2d").getImageData(0, 0, t.width, t.height).data;
    let red = 0;
    for (let i = 0; i < d.length; i += 4) { if (d[i] > 180 && d[i + 1] < 90 && d[i + 2] < 90) red++; }
    const hintGone = !document.querySelector('[data-testid="loop-first-hint"]');
    return { ok: rows.length === 2 && chip1 === "1" && chip2 === "2" && hint && hintGone, rows, chip1, chip2, red, hint, hintGone, wrap: !!ovRaw.closest(".canvas-container"), upperIsOv: ov !== ovRaw, ovW: ov.getBoundingClientRect().width, err: [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ") };
  })()`, true);
  if (!silMarks || silMarks.ok !== true || silMarks.red < 3) {
    console.error(`DESKTOP_SHOT SIL FAILED, mark drawing did not land (${JSON.stringify(silMarks)})`);
    app.exit(31);
    return;
  }
  console.log(`[shot] SIL marks OK (rows=${silMarks.rows.join(",")} red=${silMarks.red}px)`);
  await snap(win, "desktop-loop-marks.png");

  // SL-3: fill both region notes, send ONE edit carrying every region, expect a
  // second version (Edit 1), undo walks the stack, latest returns, before/after
  // toggles the badge. Mock pair: the edited canvas differs from the generated one.
  const silEdit = await win.webContents.executeJavaScript(`(async () => {
    const setVal = (el, v) => { const s = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set; s.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); };
    const n1 = document.querySelector('[data-testid="region-note-1"]');
    const n2 = document.querySelector('[data-testid="region-note-2"]');
    if (!n1 || !n2) return { ok: false, why: "note inputs missing" };
    // error-path gate: with EMPTY notes the button must refuse to send
    const edit0 = document.querySelector('[data-testid="loop-edit"]');
    if (!edit0) return { ok: false, why: "edit button missing (capability gate?)" };
    if (!edit0.disabled) return { ok: false, why: "edit enabled while notes are empty" };
    setVal(n1, "make this area a clean mint gradient");
    setVal(n2, "point at the straw with a small tag");
    const edit = document.querySelector('[data-testid="loop-edit"]');
    if (!edit) return { ok: false, why: "edit button missing (capability gate?)" };
    if (edit.disabled) return { ok: false, why: "edit disabled with both notes filled" };
    const before = document.querySelector('[data-testid="loop-image"]').src.slice(0, 96);
    edit.click();
    // the edit round now SHOWS progress (teardown P0-3). The run bar assert is
    // OBSERVATIONAL only: the mock pair finishes faster than the first poll
    // tick, so a missing bar here proves nothing (the very race the teardown
    // warned about). The bar is verified visually on a dev/real run instead.
    let runbarSeen = false;
    for (let i = 0; i < 60; i++) {
      if (document.querySelector('[data-testid="loop-runbar"]')) runbarSeen = true;
      const meta = document.querySelector('.loopMeta')?.textContent ?? "";
      if (meta.includes("Edit 1") && meta.includes("Version 2 of 2")) break;
      await new Promise((r) => setTimeout(r, 50));
    }
    const meta = document.querySelector('.loopMeta')?.textContent ?? "";
    const after = document.querySelector('[data-testid="loop-image"]').src.slice(0, 96);
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(' ');
    return { ok: /Edit 1/.test(meta) && meta.includes('Version 2 of 2') && after !== before, meta, changed: after !== before, runbarSeen, err };
  })()`, true);
  if (!silEdit || silEdit.ok !== true) {
    console.error(`DESKTOP_SHOT SIL FAILED, the edit round-trip did not land (${JSON.stringify(silEdit)})`);
    app.exit(31);
    return;
  }
  console.log(`[shot] SIL edit round-trip OK (meta "${silEdit.meta}")`);
  // owner pick 18/11 #4: the session must survive a reload/restart. Reload the
  // renderer and expect versions + prompt + carried marks to come back from
  // loop-session.json (the utility writes it atomically ~800ms after changes).
  await new Promise((r) => setTimeout(r, 1400));
  const silReload = await win.webContents.executeJavaScript(`(async () => {
    location.reload();
    return true;
  })()`, true).catch(() => true);
  if (silReload !== true) { /* reload always tears the context down; ignore */ }
  let silRestored: { img: boolean; meta: string; rows: number; prompt: string; err: string } | null = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    silRestored = await win.webContents.executeJavaScript(`(() => {
      const pills = [...document.querySelectorAll(".viewNav .navPill")];
      const loop = pills.find((p) => p.textContent.trim() === "Edit loop");
      if (loop) loop.click();
      return {
        img: !!document.querySelector('[data-testid="loop-image"]'),
        meta: document.querySelector('.loopMeta')?.textContent ?? '',
        rows: document.querySelectorAll('.loopRegion').length,
        prompt: document.querySelector('.promptCard textarea')?.value ?? '',
        err: [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(' '),
      };
    })()`, true).catch(() => null);
    if (silRestored && silRestored.img && silRestored.meta.includes("Version")) break;
  }
  if (!silRestored || !silRestored.img || !silRestored.meta.includes("Version 2 of 2") || silRestored.rows !== 2) {
    console.error(`DESKTOP_SHOT SIL FAILED, session restore wrong (${JSON.stringify(silRestored)})`);
    app.exit(31);
    return;
  }
  console.log(`[shot] SIL session restore OK (reload → "${silRestored.meta}", ${silRestored.rows} carried marks, prompt kept)`);
  await snap(win, "desktop-loop-restored.png");

  const silNav = await win.webContents.executeJavaScript(`(async () => {
    const meta = () => document.querySelector('.loopMeta')?.textContent ?? "";
    const thumb1 = document.querySelector('[data-testid="loop-version-1"]');
    const thumb2 = document.querySelector('[data-testid="loop-version-2"]');
    if (!thumb1 || !thumb2) return { ok: false, why: 'filmstrip thumbs missing', afterUndo: null };
    thumb1.click();
    await new Promise((r) => setTimeout(r, 200));
    const afterUndo = meta();
    const active1 = thumb1.classList.contains('active');
    thumb2.click();
    await new Promise((r) => setTimeout(r, 200));
    const afterLatest = meta();
    const cmp = document.querySelector('[data-testid="loop-compare"]');
    if (!cmp || cmp.disabled) return { ok: false, why: 'compare disabled', afterUndo, afterLatest };
    cmp.click();
    await new Promise((r) => setTimeout(r, 250));
    const badge = document.querySelector('[data-testid="loop-before-badge"]')?.textContent ?? null;
    cmp.click();
    await new Promise((r) => setTimeout(r, 200));
    const badgeGone = !document.querySelector('[data-testid="loop-before-badge"]');
    return { ok: afterUndo.includes('Generated') && afterUndo.includes('Version 1 of 2') && active1 && afterLatest.includes('Version 2 of 2') && badge === 'Before' && badgeGone, afterUndo, afterLatest, badge, badgeGone };
  })()`, true);
  if (!silNav || silNav.ok !== true) {
    console.error(`DESKTOP_SHOT SIL FAILED, filmstrip/compare wrong (${JSON.stringify(silNav)})`);
    app.exit(31);
    return;
  }
  console.log(`[shot] SIL history nav OK (thumb1→"${silNav.afterUndo}" thumb2→"${silNav.afterLatest}" compare badge=${silNav.badge})`);


  // SL-4 polish: keyboard tools (2/3/1), row selection + Delete, and 12 marks
  // on the overlay at once (perf sanity, pixel truth stays red).
  const silPolish = await win.webContents.executeJavaScript(`(async () => {
    const key = (k) => window.dispatchEvent(new KeyboardEvent("keydown", { key: k, bubbles: true }));
    const pressed = (id) => document.querySelector('[data-testid="' + id + '"]')?.getAttribute("aria-pressed");
    key("2");
    await new Promise((r) => setTimeout(r, 120));
    if (pressed("tool-box") !== "true") return { ok: false, why: "key 2 did not pick the box tool" };
    const ovRaw = document.querySelector('[data-testid="loop-overlay"]');
    const ov = ovRaw.closest(".canvas-container")?.querySelector(".upper-canvas") ?? ovRaw;
    if (!ov) return { ok: false, why: "no overlay" };
    const r = ov.getBoundingClientRect();
    // drag in the IMAGE bbox: committed boxes are clamped into the artwork now,
    // overlay-relative drags would land on the gray apron and get trimmed
    const img = document.querySelector('[data-testid="loop-image"]');
    const ir = img.getBoundingClientRect();
    const base = { bubbles: true, cancelable: true, pointerId: 12, isPrimary: true, pointerType: "mouse" };
    const drag = async (x0, y0, x1, y1) => {
      ov.dispatchEvent(new PointerEvent("pointerdown", { ...base, clientX: x0, clientY: y0 }));
      ov.dispatchEvent(new PointerEvent("pointermove", { ...base, clientX: x1, clientY: y1 }));
      ov.dispatchEvent(new PointerEvent("pointerup", { ...base, clientX: x1, clientY: y1 }));
      await new Promise((res) => setTimeout(res, 90));
    };
    const rowsBefore = document.querySelectorAll(".loopRegion").length;
    await drag(ir.left + ir.width * 0.2, ir.top + ir.height * 0.2, ir.left + ir.width * 0.2 + 26, ir.top + ir.height * 0.2 + 26); // keyboard-drawn box → +1 region (carry-over marks from the edit stay)
    if (document.querySelectorAll(".loopRegion").length !== rowsBefore + 1) return { ok: false, why: "keyboard tool did not draw", rows: document.querySelectorAll(".loopRegion").length, rowsBefore };
    // a fresh mark arrives SELECTED (Delete targets it); a row click toggles it
    const newId = [...document.querySelectorAll(".loopRegion")].map((n) => n.dataset.testid).find((id) => document.querySelector('[data-testid="' + id + '"] .regionChip')?.textContent === String(rowsBefore + 1));
    const sel = newId ? document.querySelector('[data-testid="' + newId + '"]')?.classList.contains("selected") : false;
    key("Delete");
    await new Promise((res) => setTimeout(res, 120));
    const rowsAfterDel = document.querySelectorAll(".loopRegion").length;
    if (!sel || rowsAfterDel !== rowsBefore) return { ok: false, why: "selection or Delete failed", sel, rowsAfterDel, rowsBefore };
    // 12 small boxes at once, overlay must stay painted (perf sanity)
    for (let i = 0; i < 12; i++) await drag(ir.left + ir.width * (0.08 + i * 0.07), ir.top + ir.height * 0.12, ir.left + ir.width * (0.08 + i * 0.07) + ir.width * 0.05, ir.top + ir.height * 0.3);
    await new Promise((res) => setTimeout(res, 300));
    const rowsAfterBoxes = document.querySelectorAll(".loopRegion").length;
    // oval tool (4) and freehand draw (5) through the fabric layer
    key("4");
    await new Promise((r) => setTimeout(r, 120));
    await drag(ir.left + ir.width * 0.3, ir.top + ir.height * 0.5, ir.left + ir.width * 0.5, ir.top + ir.height * 0.65);
    key("5");
    await new Promise((r) => setTimeout(r, 120));
    await drag(ir.left + ir.width * 0.55, ir.top + ir.height * 0.5, ir.left + ir.width * 0.7, ir.top + ir.height * 0.6);
    await new Promise((res) => setTimeout(res, 300));
    // hard proof no mark crosses the artwork's right/bottom edge: count red
    // pixels OUTSIDE the image bbox on the LOWER (drawing) canvas
    const lower2 = ovRaw;
    const rr = lower2.getBoundingClientRect();
    const dpr2 = lower2.width / Math.max(1, rr.width);
    const tc = document.createElement("canvas");
    tc.width = lower2.width; tc.height = lower2.height;
    tc.getContext("2d").drawImage(lower2, 0, 0);
    const dd2 = tc.getContext("2d").getImageData(0, 0, tc.width, tc.height).data;
    let redOutside = 0;
    const ix1 = Math.round((ir.right - rr.left) * dpr2), iy1 = Math.round((ir.bottom - rr.top) * dpr2);
    for (let y = 0; y < tc.height; y += 1) for (let x = ix1 + 2; x < tc.width; x += 1) {
      const i = (y * tc.width + x) * 4;
      if (dd2[i] > 190 && dd2[i + 1] < 90 && dd2[i + 2] < 90) redOutside++;
    }
    for (let y = iy1 + 2; y < tc.height; y += 1) for (let x = 0; x < ix1; x += 1) {
      const i = (y * tc.width + x) * 4;
      if (dd2[i] > 190 && dd2[i + 1] < 90 && dd2[i + 2] < 90) redOutside++;
    }
    // freeform feedback gate: notes missing + NO global note = disabled;
    // typing one sentence for the whole image must unlock the edit
    const editBtn = document.querySelector('[data-testid="loop-edit"]');
    const lockedBefore = editBtn ? editBtn.disabled : null;
    const gn = document.querySelector('[data-testid="loop-global-note"]');
    let unlockedByGlobal = false;
    if (gn) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set;
      setter.call(gn, "one sentence for the whole image");
      gn.dispatchEvent(new Event("input", { bubbles: true }));
      await new Promise((r) => setTimeout(r, 120));
      unlockedByGlobal = editBtn ? !editBtn.disabled : false;
    }
    const kinds = [...document.querySelectorAll(".loopRegion .regionKind")].map((n) => n.innerHTML);
    const hasOval = kinds.some((k) => k.includes("ellipse"));
    const hasPath = kinds.some((k) => k.includes("path"));
    const afterNewTools = document.querySelectorAll(".loopRegion").length;
    const rows = document.querySelectorAll(".loopRegion").length;
    const lower = ovRaw; // fabric paints objects on the LOWER canvas
    const dpr = lower.width / Math.max(1, r.width);
    const t = document.createElement("canvas");
    t.width = Math.round(r.width * dpr); t.height = Math.round(r.height * dpr);
    t.getContext("2d").drawImage(lower, 0, 0, t.width, t.height);
    const dd = t.getContext("2d").getImageData(0, 0, t.width, t.height).data;
    let red = 0;
    for (let i = 0; i < dd.length; i += 4) { if (dd[i] > 180 && dd[i + 1] < 90 && dd[i + 2] < 90) red++; }
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    return { ok: rows === rowsBefore + 14 && afterNewTools === rowsAfterBoxes + 2 && hasOval && hasPath && lockedBefore === true && unlockedByGlobal && redOutside === 0 && red > 200 && !err, rows, rowsBefore, rowsAfterBoxes, afterNewTools, hasOval, hasPath, lockedBefore, unlockedByGlobal, redOutside, red, err };
  })()`, true);
  if (!silPolish || silPolish.ok !== true) {
    console.error(`DESKTOP_SHOT SIL FAILED, polish lane (${JSON.stringify(silPolish)})`);
    app.exit(31);
    return;
  }
  console.log(`[shot] SIL polish OK (keyboard tools, Delete selection, ${silPolish.rows} regions, red=${silPolish.red}px)`);
  await snap(win, "desktop-loop-many.png");
  await snap(win, "desktop-loop-edit.png");
  await win.webContents.executeJavaScript(`document.querySelector('[data-testid="loop-reset"]').click()`, true);
  await new Promise((r) => setTimeout(r, 300));

  // ---- reorg 4d: For Agents, keys form + live loopback base URL ----------------
}
