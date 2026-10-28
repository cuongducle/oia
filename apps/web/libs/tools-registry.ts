/**
 * BR-QT — quick tools registry (4 categories).
 * kind picks the UI at /tools/[slug]; implemented = really works, landing = descriptive page.
 */
export type ToolKind = "convert-image" | "image-to-pdf" | "resize" | "chart-bar" | "chart-pie"
  | "heic-to-png" | "heic-to-pdf" | "pdf-to-jpg" | "ocr-editor" | "ai-generate" | "ai-edit" | "venn" | "landing";

export interface QuickTool {
  slug: string;
  name: string;
  desc: string;
  category: "Converter" | "Image Editor" | "Creative AI" | "Image Generator";
  kind: ToolKind;
  implemented: boolean;
}

export const QUICK_TOOLS: QuickTool[] = [
// Converter
  { slug: "png-to-jpg", name: "PNG to JPG", desc: "Convert a PNG to JPG image file", category: "Converter", kind: "convert-image", implemented: true },
  { slug: "jpg-to-pdf", name: "JPG to PDF", desc: "Convert a JPG image file to PDF", category: "Converter", kind: "image-to-pdf", implemented: true },
  { slug: "pdf-to-jpg", name: "PDF to JPG", desc: "Convert a PDF to JPG images (per page)", category: "Converter", kind: "pdf-to-jpg", implemented: true },
  { slug: "heic-to-pdf", name: "HEIC to PDF", desc: "Convert HEIC to PDF file", category: "Converter", kind: "heic-to-pdf", implemented: true },
  { slug: "heic-to-png", name: "HEIC to PNG", desc: "Convert a HEIC to PNG image file", category: "Converter", kind: "heic-to-png", implemented: true },
// Image Generation (XHS Creator included)
  { slug: "xhs-creator", name: "XHS Creator", desc: "Generate Xiaohongshu vertical carousel image sets from per-page copy descriptions", category: "Image Generator", kind: "ai-generate", implemented: true },
  // Image Editor
  { slug: "image-resizer", name: "Image Resizer", desc: "Resize images and compress for perfect sizing", category: "Image Editor", kind: "resize", implemented: true },
  { slug: "ai-image-editor", name: "AI Image Editor", desc: "Extract text from image to make it editable", category: "Image Editor", kind: "ocr-editor", implemented: true },
  // Creative AI
  { slug: "youtube-banner-maker", name: "YouTube Banner Maker", desc: "Create unique YouTube banners instantly", category: "Creative AI", kind: "ai-generate", implemented: true },
  { slug: "ai-hairstyle", name: "AI Hairstyle", desc: "Try new haircuts instantly", category: "Creative AI", kind: "ai-edit", implemented: true },
  // Image Generator
  { slug: "bar-graph-maker", name: "Bar Graph Maker", desc: "Create professional visuals with our bar chart creator", category: "Image Generator", kind: "chart-bar", implemented: true },
  { slug: "pie-chart-maker", name: "Pie Chart Maker", desc: "Create professional visuals with our pie graph maker", category: "Image Generator", kind: "chart-pie", implemented: true },
  { slug: "venn-diagram-maker", name: "Venn Diagram Maker", desc: "Create professional visuals with our venn diagram generator", category: "Image Generator", kind: "venn", implemented: true },
  { slug: "ppt-translator", name: "PPT Translator", desc: "Translate all text content in a PowerPoint (.pptx) file into a target language", category: "Image Editor", kind: "landing", implemented: false },
];

export function getTool(slug: string): QuickTool | undefined {
  return QUICK_TOOLS.find((t) => t.slug === slug);
}
