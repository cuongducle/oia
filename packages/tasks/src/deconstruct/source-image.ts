import { PNG } from "pngjs";

// D22: bound decompression before allocating RGBA buffers, including provider output.
export function readDeconstructPng(bytes: Uint8Array): PNG {
  const b = Buffer.from(bytes);
  if (b.length < 24 || !b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))) {
    throw new Error("Make text editable requires a PNG image. Export or convert the image to PNG first.");
  }
  const w = b.readUInt32BE(16), h = b.readUInt32BE(20);
  if (!w || !h || w * h > 24_000_000) throw new Error("The image exceeds the 24 megapixel text-editing limit.");
  return PNG.sync.read(b);
}
