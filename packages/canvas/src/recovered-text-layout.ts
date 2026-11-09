import { FabricText, Textbox } from "fabric";

/** D22: recovered lines grow on typing instead of wrapping into neighboring artwork. */
export function growRecoveredTextLine(target: unknown): void {
  if (!(target instanceof Textbox) || target.get("recoveredTextLine") !== true || /[\r\n]/u.test(target.text)) return;
  const style = {
    fontFamily: target.fontFamily, fontSize: target.fontSize,
    fontWeight: target.fontWeight, fontStyle: target.fontStyle,
    charSpacing: target.charSpacing, lineHeight: target.lineHeight,
    styles: target.styles, splitByGrapheme: target.splitByGrapheme,
  };
  const measure = new FabricText(target.text, style);
  try {
    const probe = new Textbox(target.text, { ...style, width: Math.max(target.width, Math.ceil(measure.width + 2)) });
    try {
      // Textbox measures word boundaries differently from Text when tracking is nonzero.
      for (let i = 0; probe.textLines.length > 1 && i < 16; i++) {
        probe.set({ width: Math.ceil(probe.width * 1.05 + 1) });
        probe.initDimensions();
      }
      if (probe.width > target.width && probe.textLines.length === 1) {
        target.set({ width: probe.width });
        target.initDimensions();
        target.setCoords();
      }
    } finally { probe.dispose(); }
  } finally { measure.dispose(); }
}
