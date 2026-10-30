import { describe, it, expect } from "vitest";
import { chatRequestSchema } from "@oia/services";
import { mapAssetUrls } from "../src/shared/assets.js";
import { IPC } from "../src/shared/channels.js";

/**
 * D2 remediation tests — the contract guards that made the first shell pass look green
 * while the canvas was actually broken.
 */
describe("chatRequestSchema (the ONE schema shared by web adapter + desktop IPC)", () => {
  it("accepts a full request and strips unknown keys (documented zod behavior)", () => {
    const parsed = chatRequestSchema.parse({
      prompt: "banner trà sữa",
      width: 900,
      height: 1200,
      mode: "clean-plate",
      retryOf: "job-1",
      someFutureField: "dropped silently",
    });
    expect(parsed.prompt).toBe("banner trà sữa");
    expect(parsed).not.toHaveProperty("someFutureField");
  });
  it("rejects junk that previously flowed into providers (NaN width, negative pages, bad mode)", () => {
    expect(chatRequestSchema.safeParse({ prompt: "x", width: Number("abc") }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ prompt: "x", pages: -1 }).success).toBe(false);
    expect(chatRequestSchema.safeParse({ prompt: "x", mode: "poster" }).success).toBe(false); // poster is the DEFAULT (omitted), never sent
    expect(chatRequestSchema.safeParse({ prompt: "" }).success).toBe(false);
  });
});

describe("mapAssetUrls (oia:// mapping — the fix for the invisible-artwork bug)", () => {
  it("rewrites /api/files scene srcs to oia://files and leaves everything else untouched", () => {
    const scene = {
      version: "7.3.1",
      objects: [
        { type: "Image", src: "/api/files/uploads/20261029/abc.png" },
        { type: "Image", src: "https://cdn.test/x.png" },
        { type: "Textbox", text: "GIẢM 20%" },
      ],
    };
    const mapped = mapAssetUrls(scene);
    expect(mapped.objects[0].src).toBe("oia://files/uploads/20261029/abc.png");
    expect(mapped.objects[1].src).toBe("https://cdn.test/x.png");
    expect((mapped.objects[2] as { text: string }).text).toBe("GIẢM 20%");
    expect(scene.objects[0].src).toBe("/api/files/uploads/20261029/abc.png"); // no in-place mutation
  });
});

describe("channels are pure data (sandbox-safe preload)", () => {
  it("IPC is a plain object of channel names", () => {
    expect(IPC.chatRun).toBe("chat:run");
    expect(Object.values(IPC).every((v) => typeof v === "string")).toBe(true);
  });
});
