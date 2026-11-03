/**
 * Fast data-URL → bytes (teardown fix #3): Uint8Array.from(atob, per-char
 * callback) is the slow decode path for multi-megabyte PNG exports — a plain
 * indexed loop it is. Pure, no DOM import so it is unit-testable in node.
 */

export function dataUrlBytes(dataUrl: string): Uint8Array {
  const b64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
