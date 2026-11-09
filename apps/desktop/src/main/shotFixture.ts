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
