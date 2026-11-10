import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/** Base64 of the shot fixture, a real PNG ("SALE 50", Arial Bold, black on
 *  white, 600×200). A garbage blob fails the preview Image load in the Create
 *  sheet, so gates that feed bytes into the renderer must use real ones. The
 *  bytes are the former OCR fixture; after D15 removed the OCR tool the B1
 *  deconstruct gate keeps it under a neutral name. */
export function fixturePngB64(): string {
  const bytes = readFileSync(path.resolve(here, "../../test/fixtures/deconstruct-banner.png"));
  return bytes.toString("base64");
}

/** SG-7: a minimal but structurally real PPTX (two slides, one text run each,
 *  the same <a:t> shapes the processor rewrites). Built in-process so the gate
 *  never depends on a binary fixture drifting from the regex contract. */
export async function fixturePptxB64(): Promise<string> {
  const { default: JSZip } = await import("jszip");
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>`);
  zip.file("ppt/slides/slide1.xml", `<p:sld xmlns:p="p"><p:sp><p:txBody><a:p><a:r><a:t>Flash sale banner</a:t></a:r></a:p></p:txBody></p:sp></p:sld>`);
  zip.file("ppt/slides/slide2.xml", `<p:sld xmlns:p="p"><p:sp><p:txBody><a:p><a:r><a:t>Buy two get one</a:t></a:r></a:p></p:txBody></p:sp></p:sld>`);
  const buf = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
  return Buffer.from(buf).toString("base64");
}

/** SG-7 error-path fixture: bytes that are NOT a zip, named .pptx. */
export function brokenPptxB64(): string {
  return Buffer.from("this is not a zip file at all, just text").toString("base64");
}
