import { app, type BrowserWindow } from "electron";

type Capture = (win: BrowserWindow, name: string) => Promise<void>;

export async function shotDeconstruct(win: BrowserWindow, snap: Capture): Promise<boolean> {
  // ---- B1: deconstruct import, old banner in, editable text layers out (mock pair)
  // Pins deconstruct-import.md: price hidden in mock, two-phase task, texts ride
  // the result, the scene opens in the editor with native Textboxes (DC-1/DC-8).
  console.log("[shot] B1: deconstructing a fixture banner…");
  const deconStarted = await win.webContents.executeJavaScript(`(async () => {
    const pills = [...document.querySelectorAll(".viewNav .navPill")];
    pills.find((p) => p.textContent.trim() === "Projects")?.click();
    await new Promise((r) => setTimeout(r, 600));
    document.querySelector('[data-testid="projects-new"]')?.click(); // R2: images come in through the Create sheet
    await new Promise((r) => setTimeout(r, 300));
    const input = document.querySelector('input[aria-label="Bring an image"]');
    if (!input) return "no-input";
    // D22: source pixels must contain all three lines returned by the mock.
    // The old SALE-only fixture made the price gate pin an unrelated glyph edge.
    await document.fonts.load('700 24px "Be Vietnam Pro"', "SALE 50 299.000₫");
    await document.fonts.load('italic 400 14px "Be Vietnam Pro"', "Chỉ hôm nay");
    const source = document.createElement("canvas"); source.width = 600; source.height = 200;
    const ctx = source.getContext("2d");
    ctx.fillStyle = "#ffffff"; ctx.fillRect(0, 0, 600, 200);
    ctx.fillStyle = "#28315d"; ctx.fillRect(0, 0, 600, 80); ctx.fillRect(0, 160, 600, 40);
    const draw = (text, x, y, font, fill, angle, tracking = "0px") => {
      ctx.save(); ctx.font = font; ctx.fillStyle = fill; ctx.letterSpacing = tracking;
      const m = ctx.measureText(text);
      ctx.translate(x, y); ctx.rotate(angle * Math.PI / 180);
      ctx.fillText(text, m.actualBoundingBoxLeft, m.actualBoundingBoxAscent); ctx.restore();
    };
    draw("SALE 50", 48, 20, '700 24px "Be Vietnam Pro"', "#ffffff", 0);
    draw("299.000₫", 60, 144, '700 18px "Be Vietnam Pro"', "#000000", -8);
    draw("Chỉ hôm nay", 60, 162, 'italic 400 14px "Be Vietnam Pro"', "#ffffff", 0, "1.4px");
    const bytes = Uint8Array.from(atob(source.toDataURL("image/png").split(",")[1]), c => c.charCodeAt(0));
    const file = new File([bytes], "old-banner.png", { type: "image/png" });
    const dt = new DataTransfer();
    dt.items.add(file);
    input.files = dt.files;
    input.dispatchEvent(new Event("change", { bubbles: true }));
    await new Promise((r) => setTimeout(r, 200));
    const editable = document.querySelector('[data-testid="create-image-editable"]');
    if (!editable || !document.querySelector('[data-testid="create-image-background"]')) return "no-image-choices";
    if (/image \+/.test(editable.textContent)) return "price-shown-in-trial"; // mock: nothing is billed
    editable.click();
    return "picked";
  })()`, true);
  if (deconStarted !== "picked") {
    console.error(`DESKTOP_SHOT B1 FAILED, picker (${deconStarted})`);
    app.exit(20);
    return false;
  }
  let deconDialog = false;
  for (let i = 0; i < 20 && !deconDialog; i++) {
    deconDialog = await win.webContents.executeJavaScript(
      `Boolean(document.querySelector('[data-testid="decon-confirm"]'))`, true,
    );
    if (!deconDialog) await new Promise((r) => setTimeout(r, 250));
  }
  const deconDialogState = await win.webContents.executeJavaScript(`(() => {
    const cost = document.querySelector('[data-testid="decon-cost"]');
    const img = document.querySelector(".deconPreview img");
    return { dialog: Boolean(cost === null && img) }; // mock provider → cost label HIDDEN
  })()`, true);
  if (!deconDialog || !deconDialogState?.dialog) {
    console.error(`DESKTOP_SHOT B1 FAILED, confirm dialog (open=${deconDialog}, state=${JSON.stringify(deconDialogState)})`);
    app.exit(20);
    return false;
  }
  await win.webContents.executeJavaScript(`document.querySelector('[data-testid="decon-confirm"]').click()`, true);
  // teardown B1 pin: "Cancel" must stay clickable WHILE the run is in flight
  // (the 2s first-poll window guarantees the busy state is observable in mock)
  const cancelAlive = await win.webContents.executeJavaScript(`(() => {
    const btn = [...document.querySelectorAll('.dialogActions .secondaryBtn')].find((b) => b.textContent.includes("Cancel"));
    return btn ? { present: true, disabled: btn.disabled, label: btn.textContent.trim() } : { present: false };
  })()`, true);
  if (!cancelAlive?.present || cancelAlive.disabled !== false) {
    console.error(`DESKTOP_SHOT B1 FAILED, cancel must stay alive mid-run (${JSON.stringify(cancelAlive)})`);
    app.exit(20);
    return false;
  }
  console.log(`[shot] B1 cancel-alive gate:`, JSON.stringify(cancelAlive));
  let deconDone: unknown = null;
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 500));
    deconDone = await win.webContents.executeJavaScript(`(() => {
      const root = document.querySelector('[data-testid="editor-root"]');
      const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
      return root ? { open: true, err } : { open: false, err };
    })()`, true).catch(() => null);
    if (deconDone && typeof deconDone === "object" && "open" in deconDone && deconDone.open) break;
  }
  // the scene load is async (loadFromJSON + fonts), poll until objects land, not just the root
  for (let i = 0; i < 20; i++) {
    const n = await win.webContents.executeJavaScript(
      `((window).__oiaCanvas ? (window).__oiaCanvas.toObject().objects.length : 0)`,
      true,
    ).catch(() => 0);
    if (n >= 2) break;
    await new Promise((r) => setTimeout(r, 500));
  }
  const deconVerify = await win.webContents.executeJavaScript(`(() => {
    const c = (window).__oiaCanvas;
    if (!c) return { ok: false, why: "no-canvas" };
    const objs = c.toObject().objects;
    const boxes = objs.filter((o) => o.type === "Textbox");
    const sale = boxes.some((o) => String(o.text ?? "").includes("SALE 50"));
    const liveImg = c.getObjects().find((o) => typeof o.get("src") === "string");
    const artScaled = liveImg ? [Math.round(liveImg.getScaledWidth()), Math.round(liveImg.getScaledHeight())] : null;
    const err = [...document.querySelectorAll('[role=alert]')].map((n) => n.textContent).join(" ");
    return { ok: sale && boxes.length === 3 && !err && artScaled !== null && artScaled[0] >= 590, textboxes: boxes.length, sale, artScaled, err };
  })()`, true);
  console.log("[shot] B1 verify:", JSON.stringify(deconVerify));
  if (!deconVerify || !deconVerify.ok) {
    console.error("DESKTOP_SHOT B1 VERIFY FAILED, expected 3 native textboxes (SALE 50 present) + clean-plate artwork");
    app.exit(20);
    return false;
  }
  // D22: assert painted glyph geometry, not merely the presence of text objects.
  const typographyVerify = await win.webContents.executeJavaScript(`(() => {
    const c = window.__oiaCanvas;
    const texts = c.getObjects().filter((o) => o.type === "textbox");
    const dims = [600, 200];
    const boxes = [[0.08, 0.1, 0.55, 0.09], [0.1, 0.72, 0.45, 0.07], [0.1, 0.81, 0.4, 0.05]];
    return texts.map((o, i) => {
      const canvas = o.toCanvasElement({ withoutTransform: true });
      const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
      let x0 = canvas.width, y0 = canvas.height, x1 = -1, y1 = -1;
      for (let y = 0; y < canvas.height; y++) for (let x = 0; x < canvas.width; x++) {
        if (data[(y * canvas.width + x) * 4 + 3] < 32) continue;
        x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y);
      }
      const dx = x0 - (canvas.width - o.width) / 2, dy = y0 - (canvas.height - o.height) / 2;
      const r = o.angle * Math.PI / 180;
      const anchor = [o.left + dx * Math.cos(r) - dy * Math.sin(r), o.top + dx * Math.sin(r) + dy * Math.cos(r)];
      const b = boxes[i];
      // D22: Canvas2D above independently paints the source at these anchors.
      const expected = [b[0] * dims[0], b[1] * dims[1]];
      const anchorOk = Math.abs(anchor[0] - expected[0]) <= 3 && Math.abs(anchor[1] - expected[1]) <= 3;
      const sizeOk = x1 >= x0 && y1 >= y0 && x1 - x0 + 1 <= b[2] * dims[0] + 3 && Math.abs(y1 - y0 + 1 - b[3] * dims[1]) <= 3;
      return { anchorOk, sizeOk, anchor, ink: [x1 - x0 + 1, y1 - y0 + 1], angle: o.angle, fill: o.fill, spacing: o.charSpacing, lines: o.textLines.length };
    });
  })()`, true);
  console.log("[shot] D22 typography pixels:", JSON.stringify(typographyVerify));
  // D23b: fill is now MEASURED from pixels (dominant ink cluster, seed only a fallback);
  // the fixture's price text is black, the mock seed claims yellow, the gate pins the truth.
  if (typographyVerify.length !== 3 || typographyVerify.some((o: { anchorOk: boolean; sizeOk: boolean; lines: number }) => !o.anchorOk || !o.sizeOk || o.lines !== 1)
      || typographyVerify[1].angle !== -8 || typographyVerify[1].fill !== "#000000" || !Number.isFinite(typographyVerify[2].spacing)) {
    console.error("DESKTOP_SHOT D22 FAILED, glyph size/anchor/style drift");
    app.exit(20);
    return false;
  }
  await snap(win, "desktop-deconstruct.png");
  console.log("[shot] B1/D22 OK (mock pair, measured glyphs, rotated text, Vietnamese accents)");

  const recoveredEditVerify = await win.webContents.executeJavaScript(`(async () => {
    const c = window.__oiaCanvas;
    const snapshot = c.toObject();
    const target = c.getObjects().find((o) => o.type === "textbox" && o.get("recoveredTextLine") === true);
    if (!target) return { ok: false, why: "missing recovered text marker" };
    const before = { width: target.width, fontSize: target.fontSize, left: target.left, top: target.top, angle: target.angle };
    const replacement = "Chủ nhật vui vẻ! Cà phê sáng cùng bạn bè";
    const type = (o, text) => {
      c.setActiveObject(o); o.enterEditing();
      const input = o.hiddenTextarea;
      input.value = text; input.selectionStart = input.selectionEnd = text.length;
      input.dispatchEvent(new InputEvent("input", { bubbles: true, inputType: "insertText" }));
      o.exitEditing(); c.renderAll();
    };
    type(target, replacement);
    const edited = {
      text: target.text, lines: target.textLines.length, grew: target.width > before.width, before,
      after: { width: target.width, fontSize: target.fontSize, left: target.left, top: target.top, angle: target.angle },
      sameStyle: target.fontSize === before.fontSize && Math.abs(target.left - before.left) < 0.001 && Math.abs(target.top - before.top) < 0.001 && target.angle === before.angle,
    };
    const saved = c.toObject();
    await c.loadFromJSON(saved);
    const restored = c.getObjects().find((o) => o.text === replacement);
    type(restored, replacement + " nhé!");
    const reloadOk = restored.get("recoveredTextLine") === true && restored.textLines.length === 1;
    const duplicate = await restored.clone();
    const cloneOk = duplicate.get("recoveredTextLine") === true;
    duplicate.dispose();
    type(restored, "Dòng một\\nDòng hai");
    const explicitBreakOk = restored.textLines.length === 2;
    restored.set("recoveredTextLine", false);
    restored.set({ text: "ordinary text", width: 40 });
    const ordinaryWidth = restored.width;
    type(restored, replacement);
    const ordinaryOk = restored.width === ordinaryWidth && restored.textLines.length > 1;
    await c.loadFromJSON(snapshot); c.renderAll();
    return { ok: edited.text === replacement && edited.lines === 1 && edited.grew && edited.sameStyle && reloadOk && cloneOk && explicitBreakOk && ordinaryOk, edited, reloadOk, cloneOk, explicitBreakOk, ordinaryOk };
  })()`, true);
  console.log("[shot] recovered text typing:", JSON.stringify(recoveredEditVerify));
  if (!recoveredEditVerify?.ok) {
    console.error("DESKTOP_SHOT recovered text typing FAILED");
    app.exit(20);
    return false;
  }

  // ---- D24: "Make text editable" is REGION-ONLY (owner 2026-11-13): drag a
  // box, the deconstruct task sees ONLY the crop (wire unchanged), the page is
  // merged additively (plate over the region + text layers), never swapped.
  console.log("[shot] D24: region-only make text editable…");
  const regionPrep = await win.webContents.executeJavaScript(`(async () => {
    const c = window.__oiaCanvas;
    if (!c) return { failed: "no-canvas" };
    const before = c.toObject().objects.length;
    const img = c.getObjects().find((o) => typeof o.get("src") === "string");
    if (!img) return { failed: "no-image" };
    c.setActiveObject(img);
    c.requestRenderAll();
    await new Promise((r) => setTimeout(r, 400));
    const btn = document.querySelector('[data-testid="ctx-make-text-editable"]');
    if (!btn) return { failed: "no-button" };
    btn.click();
    await new Promise((r) => setTimeout(r, 400));
    const marquee = c.getObjects().find((o) => o.get("name") === "d24-text-edit-region");
    if (!marquee) return { failed: "no-marquee" };
    if (c.getObjects().some((o) => o.get("name") === "d24-text-edit-region" && o.get("excludeFromExport") !== true)) return { failed: "marquee-serializes" };
    // geometry via the fabric API, equivalent to the drag: the SALE band only
    marquee.set({ left: 24, top: 8, width: 560, height: 70, scaleX: 1, scaleY: 1 });
    marquee.setCoords();
    c.fire("object:modified", { target: marquee });
    await new Promise((r) => setTimeout(r, 300));
    const confirmBtn = document.querySelector('[data-testid="text-edit-confirm"]');
    const size = document.querySelector('[data-testid="text-edit-region-size"]');
    return { before, dialog: Boolean(confirmBtn), size: size ? size.textContent : "" };
  })()`, true);
  if (!regionPrep || regionPrep.failed || !regionPrep.dialog) {
    console.error(`DESKTOP_SHOT D24 FAILED, region prep (${JSON.stringify(regionPrep)})`);
    app.exit(20);
    return false;
  }
  if (!/560 × 70/.test(String(regionPrep.size))) {
    console.error(`DESKTOP_SHOT D24 FAILED, region size label (${regionPrep.size})`);
    app.exit(20);
    return false;
  }
  await win.webContents.executeJavaScript(`document.querySelector('[data-testid="text-edit-confirm"]').click()`, true);
  // teardown pin: Stop must stay clickable while the run is in flight
  const stopAlive = await win.webContents.executeJavaScript(`(() => {
    const btn = [...document.querySelectorAll('.dialogActions .secondaryBtn')].find((b) => b.textContent.includes("Stop"));
    return btn ? { present: true, disabled: btn.disabled } : { present: false };
  })()`, true);
  if (!stopAlive?.present || stopAlive.disabled !== false) {
    console.error(`DESKTOP_SHOT D24 FAILED, stop must stay alive mid-run (${JSON.stringify(stopAlive)})`);
    app.exit(20);
    return false;
  }
  const target = regionPrep.before + 4; // plate image + 3 text layers land additively
  let regionDone = false;
  for (let i = 0; i < 50 && !regionDone; i++) {
    await new Promise((r) => setTimeout(r, 500));
    regionDone = await win.webContents.executeJavaScript(
      `((window).__oiaCanvas ? (window).__oiaCanvas.toObject().objects.length >= ${target} : false)`,
      true,
    ).catch(() => false);
  }
  await new Promise((r) => setTimeout(r, 800)); // scene load + render settle
  const regionVerify = await win.webContents.executeJavaScript(`(() => {
    const c = window.__oiaCanvas;
    if (!c) return { ok: false, why: "no-canvas" };
    const liveTexts = c.getObjects().filter((o) => o.type === "textbox");
    const sales = liveTexts.filter((o) => String(o.text ?? "").includes("SALE 50"));
    const fresh = sales.find((o) => o.left > 60);  // 24 + 0.08 * 560 = 68.8
    const original = sales.find((o) => o.left <= 60); // B1 line sits at ~48
    const images = c.getObjects().filter((o) => typeof o.get("src") === "string");
    const plate = images.find((o) => Math.round(o.left) === 24 && Math.round(o.top) === 8);
    const marqueeGone = !c.getObjects().some((o) => o.get("name") === "d24-text-edit-region");
    const notice = document.querySelector('.notice[role=status]')?.textContent ?? "";
    return {
      ok: sales.length === 2 && Boolean(fresh) && Boolean(original) && Boolean(plate) && marqueeGone && notice.includes("rebuilt from the selected area"),
      sales: sales.length, fresh: fresh ? [Math.round(fresh.left), Math.round(fresh.top)] : null, // want ~[69, 15]
      original: original ? Math.round(original.left) : null, // want ~48, untouched
      plate: plate ? [Math.round(plate.getScaledWidth()), Math.round(plate.getScaledHeight())] : null, // want ~[560, 70]
      marqueeGone, notice,
    };
  })()`, true);
  console.log("[shot] D24 verify:", JSON.stringify(regionVerify));
  if (!regionVerify || !regionVerify.ok
      || !regionVerify.fresh || Math.abs(regionVerify.fresh[0] - 69) > 4 || Math.abs(regionVerify.fresh[1] - 15) > 4
      || !regionVerify.plate || Math.abs(regionVerify.plate[0] - 560) > 4 || Math.abs(regionVerify.plate[1] - 70) > 4
      || !regionVerify.original || Math.abs(regionVerify.original - 48) > 4) {
    console.error("DESKTOP_SHOT D24 VERIFY FAILED, expected additive region overlay (fresh text at ~[69,15], plate ~[560x70], original untouched at ~48)");
    app.exit(20);
    return false;
  }
  await snap(win, "desktop-deconstruct-region.png");
  console.log("[shot] D24 OK (region-only, additive merge, page outside the box untouched)");
  return true;
}
