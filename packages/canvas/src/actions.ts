/**
 * Toolbar and export behavior for the editor.
 */

/** BR-ED4: text toolbar — color, font, B/I/U/S, align, size, 4 layer orders, spacing, duplicate. */
export const TEXT_TOOLBAR_ACTIONS = [
  "color", "font", "bold", "italic", "underline", "strike",
  "alignLeft", "alignCenter", "alignRight",
  "fontSize", "layerFront", "layerForward", "layerBackward", "layerBack",
  "charSpacing", "duplicate",
] as const;
export type TextToolbarAction = (typeof TEXT_TOOLBAR_ACTIONS)[number];

export type LayerAction = Extract<
  TextToolbarAction, "layerFront" | "layerForward" | "layerBackward" | "layerBack"
>;

/** Map action → fabric object operation. */
export function applyLayerAction(
  obj: { bringToFront(): void; bringForward(): void; sendBackwards(): void; sendToBack(): void },
  action: LayerAction,
): void {
  switch (action) {
    case "layerFront": obj.bringToFront(); break;
    case "layerForward": obj.bringForward(); break;
    case "layerBackward": obj.sendBackwards(); break;
    case "layerBack": obj.sendToBack(); break;
  }
}

/** BR-ED5: export matrix (JPG/PNG + ALL/Current scope; chat adds ZIP(jpg)/PDF/PPTX). */
export const EXPORT_FORMATS = ["jpg", "png", "pdf", "pptx", "zip"] as const;
export type ExportFormat = (typeof EXPORT_FORMATS)[number];
export const EXPORT_SCOPES = ["all", "current"] as const;
export type ExportScope = (typeof EXPORT_SCOPES)[number];

export interface ExportPlan {
  format: ExportFormat;
  scope: ExportScope;
/** zip/pdf/pptx support multiple pages — with current scope only one page is used */
  pages: number;
/** client-side render strategy */
  strategy: "canvas-dataurl" | "jspdf" | "pptxgenjs" | "jszip";
  fileName: string;
  defaultQuality: number;
}

/** Build the export plan. */
export function planExport(
  format: ExportFormat,
  scope: ExportScope,
  totalPages: number,
  projectName = "project",
): ExportPlan {
    if (totalPages < 1) throw new Error("at least one page is required");
  const pages = scope === "all" ? totalPages : 1;
  const slug = projectName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "project";
  switch (format) {
    case "png":
    case "jpg": {
// Single page downloads directly; ALL scope with multiple pages bundles a ZIP
      if (pages <= 1) {
        return { format, scope, pages, strategy: "canvas-dataurl", fileName: `${slug}.${format}`, defaultQuality: 0.92 };
      }
      return { format, scope, pages, strategy: "jszip", fileName: `${slug}-${format}.zip`, defaultQuality: 0.9 };
    }
    case "pdf":
      return { format, scope, pages, strategy: "jspdf", fileName: `${slug}.pdf`, defaultQuality: 0.92 };
    case "pptx":
      return { format, scope, pages, strategy: "pptxgenjs", fileName: `${slug}.pptx`, defaultQuality: 0.92 };
    case "zip":
// Multiple images bundle into one zip
      return { format, scope, pages, strategy: "jszip", fileName: `${slug}-jpg.zip`, defaultQuality: 0.9 };
  }
}
