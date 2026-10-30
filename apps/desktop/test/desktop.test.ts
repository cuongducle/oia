import { describe, it, expect } from "vitest";
import { chatRequestSchema } from "@oia/services";
import { runtimeSetModeSchema } from "../src/shared/ipc.js";
import { runtimeViewModel, installPhaseText, runtimeErrorText } from "../src/renderer/runtime-panel.js";
import { resolveEffectiveMode, normalizeProvidersSettings } from "../src/shared/providers-mode.js";
import type { RuntimeStatus } from "@oia/providers";
import { mapAssetUrls, unmapAssetUrls, toDisplayUrl, toCanonicalUrl } from "../src/shared/assets.js";
import { IPC } from "../src/shared/channels.js";
import { filesUploadSchema, exportSaveSchema, projectsSaveSchema, taskSubmitSchema, brandKitUpsertSchema, apiKeyCreateSchema, clipboardWriteSchema } from "../src/shared/ipc.js";

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

// ---- reorg step 4c/4d: quick tools + brand kits + For Agents IPC schemas ----
describe("task lane + brand kit + api key IPC schemas", () => {
  it("taskSubmitSchema admits a known type and rejects an unknown one (web parity: strict params stay in TaskStore)", () => {
    expect(taskSubmitSchema.safeParse({ type: "generate-poster", params: { prompt: "x" } }).success).toBe(true);
    expect(taskSubmitSchema.safeParse({ type: "generate-poster" }).success).toBe(true); // params default {}
    expect(taskSubmitSchema.safeParse({ type: "not-a-task", params: {} }).success).toBe(false);
    expect(taskSubmitSchema.safeParse({ type: "image-edit", params: "junk" }).success).toBe(false);
  });
  it("brandKitUpsertSchema enforces the store limits on the wire (and defaults fill like the store)", () => {
    const good = brandKitUpsertSchema.safeParse({ name: "Kit", colors: ["#7050e5"], fonts: ["Inter"], logos: ["/api/files/uploads/20261106/a.png"], applyByDefault: true });
    expect(good.success).toBe(true);
    // the bug this port caught: an uploaded logo (canonical /api/files form) used to fail .url()
    expect(brandKitUpsertSchema.safeParse({ name: "x", logos: ["javascript:alert(1)"] }).success).toBe(false);
    expect(brandKitUpsertSchema.safeParse({ name: "x", logos: Array.from({ length: 4 }, () => "https://a/1.png") }).success).toBe(false);
    expect(brandKitUpsertSchema.safeParse({ name: "x", colors: ["red"] }).success).toBe(false);
    expect(brandKitUpsertSchema.safeParse({ name: "x", guidance: "a".repeat(2001) }).success).toBe(false);
    expect(brandKitUpsertSchema.safeParse({ name: "x", oops: true }).success).toBe(false); // strict
  });
  it("apiKeyCreateSchema bounds the name + ttl (days, positive, capped)", () => {
    expect(apiKeyCreateSchema.safeParse({ name: "claude-code", ttlDays: 30 }).success).toBe(true);
    expect(apiKeyCreateSchema.safeParse({ name: "k", ttlDays: null }).success).toBe(true);
    expect(apiKeyCreateSchema.safeParse({ name: "", ttlDays: null }).success).toBe(false);
    expect(apiKeyCreateSchema.safeParse({ name: "k", ttlDays: 0 }).success).toBe(false);
    expect(apiKeyCreateSchema.safeParse({ name: "k", ttlDays: 1.5 }).success).toBe(false);
  });
  it("clipboardWriteSchema caps the payload (main-side copy lane — see cross-platform doc)", () => {
    expect(clipboardWriteSchema.safeParse({ text: "http://127.0.0.1:52359/api" }).success).toBe(true);
    expect(clipboardWriteSchema.safeParse({ text: "" }).success).toBe(true);
    expect(clipboardWriteSchema.safeParse({ text: "x".repeat(10_001) }).success).toBe(false);
    expect(clipboardWriteSchema.safeParse({}).success).toBe(false);
  });
});

// ---- TP-D3: codex runtime surface ----
describe("runtime IPC schema", () => {
  it("accepts the three provider-mode choices and rejects junk", () => {
    expect(runtimeSetModeSchema.parse({ mode: "auto" })).toEqual({ mode: "auto" });
    expect(runtimeSetModeSchema.parse({ mode: "mock" })).toEqual({ mode: "mock" });
    expect(runtimeSetModeSchema.parse({ mode: "codex" })).toEqual({ mode: "codex" });
    expect(runtimeSetModeSchema.safeParse({ mode: "gpt" }).success).toBe(false);
    expect(runtimeSetModeSchema.safeParse({}).success).toBe(false);
  });
  it("declares the runtime channels (pure data, sandbox-safe)", () => {
    expect(IPC.runtimeStatus).toBe("runtime:status");
    expect(IPC.runtimeInstall).toBe("runtime:install");
    expect(IPC.runtimeLogin).toBe("runtime:login");
    expect(IPC.runtimeLogout).toBe("runtime:logout");
    expect(IPC.runtimeSetMode).toBe("runtime:setMode");
    expect(IPC.runtimeCancel).toBe("runtime:cancel");
    expect(IPC.runtimeEvent).toBe("runtime:event");
  });
});

describe("runtimeViewModel (the panel action matrix, Q11 English copy)", () => {
  const base: RuntimeStatus = { state: "missing", source: null, bin: null };
  it("missing → install CTA with the checksum promise, NO drifting byte count", () => {
    const vm = runtimeViewModel(base, "auto", "mock");
    expect(vm.badge).toBe("err");
    expect(vm.actions).toEqual(["install"]);
    expect(vm.headline).toContain("Codex is not installed");
    expect(vm.detail).not.toMatch(/MB|GB/);
  });
  it("not_logged_in → login ONLY (enableReal before login just sets up a failure)", () => {
    const st: RuntimeStatus = { state: "not_logged_in", source: "path", bin: "/usr/local/bin/codex", version: "0.163.0" };
    expect(runtimeViewModel(st, "auto", "mock").actions).toEqual(["login"]);
    expect(runtimeViewModel(st, "codex", "mock").actions).toEqual(["login"]);
  });
  it("ready + effective mock → enableReal offered next to logout", () => {
    const st: RuntimeStatus = { state: "ready", source: "managed", bin: "/x/codex", version: "0.166.0", loggedIn: true, loginMethod: "chatgpt" };
    const vm = runtimeViewModel(st, "auto", "mock");
    expect(vm.badge).toBe("ok");
    expect(vm.actions).toEqual(["logout", "enableReal"]);
    expect(vm.detail).toContain("ChatGPT");
    expect(vm.detail).toContain("installed by the app");
  });
  it("ready + effective codex → no enableReal (already real)", () => {
    const st: RuntimeStatus = { state: "ready", source: "path", bin: "/x/codex", loggedIn: true, loginMethod: "api-key" };
    expect(runtimeViewModel(st, "codex", "codex").actions).toEqual(["logout"]);
  });
  it("install phases localize (Q11 English) with the percentage threaded through", () => {
    expect(installPhaseText("download", 42)).toBe("Downloading Codex… 42%");
    expect(installPhaseText("checksum")).toBe("Verifying checksum…");
    expect(installPhaseText("finalize")).toBe("Finishing up…");
  });
});

// ---- D3 hardening: consent-gated auto mode + English (Q11) error mapping ----

describe("normalizeProvidersSettings (D13 — fresh installs default to auto + GRANTED consent)", () => {
  it("missing/corrupt file → auto + consent granted (zero-config real mode, owner's call)", () => {
    expect(normalizeProvidersSettings(null)).toEqual({ providers: "auto", codexConsent: true });
    expect(normalizeProvidersSettings("garbage")).toEqual({ providers: "auto", codexConsent: true });
    expect(normalizeProvidersSettings({ providers: "codex" })).toEqual({ providers: "codex", codexConsent: true });
  });
  it("an explicit opt-out stays an opt-out; junk providers values fall back to auto", () => {
    expect(normalizeProvidersSettings({ providers: "auto", codexConsent: false })).toEqual({ providers: "auto", codexConsent: false });
    expect(normalizeProvidersSettings({ providers: "yolo", codexConsent: false }).providers).toBe("auto");
  });
  it("the D13 default does NOT bypass the runtime gate: no login → mock even with consent", () => {
    const s = normalizeProvidersSettings(null);
    expect(resolveEffectiveMode({ choice: s.providers, consent: s.codexConsent, runtimeState: "not_logged_in", env: {} })).toBe("mock");
    expect(resolveEffectiveMode({ choice: s.providers, consent: s.codexConsent, runtimeState: "ready", env: {} })).toBe("codex");
  });
});

describe("resolveEffectiveMode (quota consent: a brew-installed codex never auto-bills)", () => {
  const base = { choice: "auto" as const, runtimeState: "ready" as const, env: {} };
  it("auto + ready + NO consent → mock (the dev machine must not silently burn quota)", () => {
    expect(resolveEffectiveMode({ ...base, consent: false })).toBe("mock");
  });
  it("auto + ready + consent → codex (the seller who acted through the panel)", () => {
    expect(resolveEffectiveMode({ ...base, consent: true })).toBe("codex");
  });
  it("consent alone is not enough — the runtime must be ready", () => {
    expect(resolveEffectiveMode({ ...base, consent: true, runtimeState: "not_logged_in" })).toBe("mock");
    expect(resolveEffectiveMode({ ...base, consent: true, runtimeState: "missing" })).toBe("mock");
    expect(resolveEffectiveMode({ ...base, consent: true, runtimeState: null })).toBe("mock");
  });
  it("CI smoke/shot are pinned mock no matter what; an env pin beats everything else", () => {
    expect(resolveEffectiveMode({ ...base, consent: true, env: { OIA_DESKTOP_SMOKE: "1" } })).toBe("mock");
    expect(resolveEffectiveMode({ ...base, consent: true, env: { OIA_DESKTOP_SHOT: "1" } })).toBe("mock");
    expect(resolveEffectiveMode({ choice: "auto", consent: false, runtimeState: "ready", env: { OIA_DESKTOP_PROVIDERS: "codex" } })).toBe("codex");
    expect(resolveEffectiveMode({ choice: "auto", consent: false, runtimeState: "ready", env: { OIA_DESKTOP_REAL_SMOKE: "1" } })).toBe("codex"); // explicit owner run
    expect(resolveEffectiveMode({ choice: "codex", consent: false, runtimeState: null, env: {} })).toBe("codex");
  });
});

describe("runtimeErrorText (Q11 English; errorClass crosses IPC, not raw dumps)", () => {
  const rt = (message: string) => ({ name: "RuntimeProviderError", message });
  it("maps the runtime error classes to actionable English", () => {
    expect(runtimeErrorText(rt("provider_missing"))).toContain("Install Codex");
    expect(runtimeErrorText(rt("rate_limited"))).toContain("GitHub");
    expect(runtimeErrorText(rt("cancelled"))).toContain("Cancelled");
    expect(runtimeErrorText({ name: "Error", message: "checksum mismatch for codex-package-x.tar.gz" })).toContain("checksum");
  });
  it("unknown errors keep a SHORT tail, not the whole message", () => {
    const text = runtimeErrorText({ name: "Error", message: "some very long error message ".repeat(10) });
    expect(text).toMatch(/^Something went wrong/);
    expect(text.length).toBeLessThan(200);
  });
});

/**
 * D11 (reorg step 4a) — the main↔utility wire protocol. Error shape must survive
 * the roundtrip: name/errorClass are the renderer's stable mapping contracts.
 */
import { serializeUtilityError, deserializeUtilityError } from "../src/shared/utility-protocol.js";

describe("utility protocol — error shape survives the wire", () => {
  it("keeps name + errorClass so renderer maps stay stable", () => {
    const err = new Error("codex timeout sau 360s") as Error & { errorClass?: string };
    err.name = "ProviderError";
    err.errorClass = "timeout";
    const shape = serializeUtilityError(err);
    expect(shape).toEqual({ name: "ProviderError", message: "codex timeout sau 360s", errorClass: "timeout" });
    const back = deserializeUtilityError(shape);
    expect(back).toBeInstanceOf(Error);
    expect(back.name).toBe("ProviderError");
    expect((back as Error & { errorClass?: string }).errorClass).toBe("timeout");
    expect(back.message).toBe("codex timeout sau 360s");
  });
  it("plain errors serialize without errorClass; non-Error throwables never crash the wire", () => {
    expect(serializeUtilityError(new Error("x"))).toEqual({ name: "Error", message: "x" });
    expect(serializeUtilityError("boom")).toEqual({ name: "Error", message: "boom" });
    expect(serializeUtilityError(undefined)).toEqual({ name: "Error", message: "undefined" });
  });
});

/** T3 — the pure service-env builder (main never mutates process.env anymore). */
describe("buildServiceEnv (T3 pure builder)", () => {
  it("mode is written, a detected codex bin is threaded, and the BASE env is never mutated", async () => {
    const { buildServiceEnv } = await import("../src/shared/providers-mode.js");
    const base = Object.freeze({ ...process.env, MY_MARKER: "x" } as Record<string, string | undefined>);
    const env = buildServiceEnv(base, "codex", "/managed/current/bin/codex");
    expect(env.IMAGE_PROVIDER).toBe("codex");
    expect(env.LLM_PROVIDER).toBe("codex");
    expect(env.CODEX_BIN).toBe("/managed/current/bin/codex");
    expect(env.MY_MARKER).toBe("x");
    expect(base.CODEX_BIN).toBeUndefined(); // frozen base untouched — the old code mutated process.env
  });

  it("mock mode carries NO CODEX_BIN decision (the base value passes through untouched)", async () => {
    const { buildServiceEnv } = await import("../src/shared/providers-mode.js");
    const env = buildServiceEnv({ CODEX_BIN: "/user/exported/bin" }, "mock", null);
    expect(env.IMAGE_PROVIDER).toBe("mock");
    expect(env.CODEX_BIN).toBe("/user/exported/bin"); // not deleted, not overwritten
  });
});
