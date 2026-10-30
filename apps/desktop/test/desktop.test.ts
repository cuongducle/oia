import { describe, it, expect } from "vitest";
import { chatRequestSchema } from "@oia/services";
import { mapAssetUrls, unmapAssetUrls, toDisplayUrl, toCanonicalUrl } from "../src/shared/assets.js";
import { IPC } from "../src/shared/channels.js";
import { filesUploadSchema, exportSaveSchema, projectsSaveSchema } from "../src/shared/ipc.js";

/**
 * D2 remediation tests — the contract guards that made the first shell pass look green
 * while the canvas was actually broken. Extended for the D2 renderer port (editor /
 * workspace / templates / upload / export IPC) and the asset URL mapping both ways.
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
  it("maps studio artwork to RELATIVE paths (absolute /studio breaks under file:// in the packaged app)", () => {
    expect(toDisplayUrl("/studio/matcha.webp")).toBe("studio/matcha.webp");
    expect(toCanonicalUrl("studio/matcha.webp")).toBe("/studio/matcha.webp");
    expect(toCanonicalUrl("https://cdn.test/x.png")).toBe("https://cdn.test/x.png"); // external stays external
  });
  it("round-trips display ↔ canonical without drift (autosave sends canonical scenes to the stores)", () => {
    const scene = {
      version: "7.3.1",
      objects: [
        { type: "Image", src: "/api/files/uploads/a/b.png" },
        { type: "Image", src: "/studio/festival.webp" },
        { type: "Image", src: "https://cdn.test/x.png" },
        { type: "Rect" },
      ],
    };
    const roundTrip = unmapAssetUrls(mapAssetUrls(scene));
    expect(roundTrip).toEqual(scene);
  });
});

describe("channels are pure data (sandbox-safe preload)", () => {
  it("IPC is a plain object of channel names", () => {
    expect(IPC.chatRun).toBe("chat:run");
    expect(Object.values(IPC).every((v) => typeof v === "string")).toBe(true);
  });
});

describe("D2 renderer port IPC schemas", () => {
  it("filesUploadSchema accepts an image and rejects junk (ext, empty, oversize)", () => {
    const ok = filesUploadSchema.safeParse({ name: "photo.png", bytes: new Uint8Array([1, 2, 3]) });
    expect(ok.success).toBe(true);
    expect(filesUploadSchema.safeParse({ name: "virus.exe", bytes: new Uint8Array([1]) }).success).toBe(false);
    expect(filesUploadSchema.safeParse({ name: "empty.png", bytes: new Uint8Array([]) }).success).toBe(false);
    const big = new Uint8Array(25 * 1024 * 1024 + 1);
    expect(filesUploadSchema.safeParse({ name: "huge.png", bytes: big }).success).toBe(false);
    expect(filesUploadSchema.safeParse({ name: "x.png", bytes: "not-bytes" }).success).toBe(false);
  });
  it("exportSaveSchema guards the native save dialog input (file-name charset, real bytes)", () => {
    expect(exportSaveSchema.safeParse({ fileName: "banner.png", bytes: new Uint8Array([1]) }).success).toBe(true);
    expect(exportSaveSchema.safeParse({ fileName: "a/bad:name.png", bytes: new Uint8Array([1]) }).success).toBe(false);
    expect(exportSaveSchema.safeParse({ fileName: "banner.png" }).success).toBe(false);
  });
  it("projectsSaveSchema passes pages through loosely (the store's projectSchema is the strict gate)", () => {
    expect(projectsSaveSchema.safeParse({ id: "prj_1", name: "N", pages: [{ id: "p1" }] }).success).toBe(true);
    expect(projectsSaveSchema.safeParse({ id: "", pages: [] }).success).toBe(false);
    expect(projectsSaveSchema.safeParse({ id: "prj_1", name: "x".repeat(121) }).success).toBe(false);
  });
});
