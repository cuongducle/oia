import { describe, expect, it } from "vitest";
import { dataUrlBytes } from "./data-url.js";

describe("dataUrlBytes", () => {
  it("round-trips a PNG data URL byte-for-byte", () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3, 0xff]);
    const url = `data:image/png;base64,${png.toString("base64")}`;
    expect(Buffer.from(dataUrlBytes(url)).equals(png)).toBe(true);
  });
  it("handles empty payloads without throwing", () => {
    expect(dataUrlBytes("data:image/png;base64,").length).toBe(0);
  });
});
