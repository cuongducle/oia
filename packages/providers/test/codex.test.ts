import { describe, expect, it, afterAll } from "vitest";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { writeRunnableCli } from "./fakeCli.js";
import {
  CodexImageProvider,
  CodexLlmProvider,
  CodexBridge,
  CliRuntime,
  parseImagePath,
  parseImagePathHint,
  parseThreadId,
  findSessionImage,
  newestGeneratedImage,
  classifyCodexFailure,
  buildPosterPrompt,
  buildCleanPlatePrompt,
  referenceClauses,
  pngSize,
} from "../src/index.js";
import { FailingMockLlmProvider } from "../src/testing/failing-mock.js";

const fx = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), "utf8");

/** Minimal 1×1 PNG for size probing. */
const PNG_1PX = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGNgYGBgAAAABQABh6FO1AAAAABJRU5ErkJggg==",
  "base64",
);

describe("BR-CODEX path parsing: POSIX + both Windows forms (B4 fixtures)", () => {
  it("parses the POSIX path from real codex exec stdout", () => {
    expect(parseImagePath(fx("stdout-posix.txt"))).toBe(
      "/Users/x/.codex/generated_images/01a17d67-6b20-7440-81a5-78206ba6fa7c/exec-04d1a627-a40b-4c5f-8353-32f4c589fd3a.png",
    );
  });
  it("parses C:\\… (drive-letter backslash)", () => {
    expect(parseImagePath(fx("stdout-windows-backslash.txt"))).toBe(
      "C:\\Users\\seller\\AppData\\Local\\codex\\generated_images\\9f2c31e0-1111-4222-8333-abcdefabcdef\\exec-77788899-aaaa-bbbb-cccc-dddd00001111.png",
    );
  });
  it("parses c:/… (drive-letter forward slash, lowercase)", () => {
    expect(parseImagePath(fx("stdout-windows-slash.txt"))).toBe(
      "c:/Users/seller/.codex/generated_images/aa11bb22-cc33-dd44-ee55-ff6677889900/exec-deadbeef-1234-5678-9abc-def012345678.png",
    );
  });
  it("degraded output (no File: marker) → null, format drift is real", () => {
    expect(parseImagePath(fx("stdout-degraded.txt"))).toBeNull();
    expect(parseImagePath("some random output")).toBeNull();
  });
  it("parseImagePathHint is an alias (the marker is a hint, never the locator)", () => {
    expect(parseImagePathHint(fx("stdout-posix.txt"))).toContain("generated_images");
  });
});

describe("--json thread events (spike S1 locator)", () => {
  it("extracts the session id from thread.started", () => {
    expect(parseThreadId(fx("thread-events.txt"))).toBe("01a18779-ad93-7652-8084-3b82f9f767de");
  });
  it("quota failure output carries the thread id too", () => {
    expect(parseThreadId(fx("error-quota.txt"))).toBe("01quota-0000-0000-0000-000000000000");
  });
  it("no events → null", () => {
    expect(parseThreadId("plain text\noutput only")).toBeNull();
  });
});

describe("classifyCodexFailure: error taxonomy mapping (TP.4)", () => {
  const base = { code: 1, stdout: "", stderr: "", timedOut: false, aborted: false };
  it("quota exhaustion → quota_exceeded", () => {
    expect(classifyCodexFailure({ ...base, stdout: fx("error-quota.txt") }).errorClass).toBe("quota_exceeded");
  });
  it("login expiry → not_logged_in", () => {
    expect(classifyCodexFailure({ ...base, stdout: fx("error-login-expired.txt") }).errorClass).toBe("not_logged_in");
  });
  it("rate limit NEVER becomes a timeout", () => {
    expect(classifyCodexFailure({ ...base, stderr: "HTTP 429 too many requests" }).errorClass).toBe("rate_limited");
    expect(classifyCodexFailure({ ...base, timedOut: true }).errorClass).toBe("timeout");
  });
  it("abort → cancelled", () => {
    expect(classifyCodexFailure({ ...base, aborted: true }).errorClass).toBe("cancelled");
  });
  it("content refusal → content_refused", () => {
    expect(classifyCodexFailure({ ...base, stderr: "request was refused by the content policy" }).errorClass).toBe("content_refused");
  });
});

describe("session-directory locator (S1) + provenance-marked fallback", () => {
  const root = path.join(tmpdir(), `oia-test-images-${Date.now()}`);
  const sessionId = "01abcd12-34ef-5678-9abc-def012345678";
  mkdirSync(path.join(root, sessionId), { recursive: true });
  writeFileSync(path.join(root, sessionId, "exec-aaa.png"), PNG_1PX);

  it("finds exec-*.png inside the session dir", async () => {
    expect(await findSessionImage(sessionId, root)).toBe(path.join(root, sessionId, "exec-aaa.png"));
  });
  it("unknown session → null", async () => {
    expect(await findSessionImage("does-not-exist", root)).toBeNull();
  });
  it("fallback scan finds the newest image in the window", async () => {
    expect(await newestGeneratedImage(60_000, root)).toContain("exec-aaa.png");
  });
  it("pngSize reads IHDR", () => {
    expect(pngSize(PNG_1PX)).toEqual({ width: 1, height: 1 });
  });
});

describe("TP.3 mode-aware prompt templates", () => {
  const input = { prompt: "pastel iced milk coffee poster", width: 900, height: 1200 };
  it("poster keeps the fidelity guard (today's behavior)", () => {
    expect(buildPosterPrompt(input)).toContain("Render all text exactly as written");
    expect(buildPosterPrompt(input)).toContain("vertical");
  });
  it("DEF-1: the DESIRED ratio rides the prompt in named form + a text safe area (poster)", () => {
    expect(buildPosterPrompt(input)).toContain("3:4 aspect ratio"); // 900×1200
    expect(buildPosterPrompt({ ...input, width: 1360, height: 2048 })).toContain("2:3 aspect ratio");
    expect(buildPosterPrompt({ ...input, width: 1080, height: 1080 })).toContain("1:1 aspect ratio");
    expect(buildPosterPrompt({ ...input, width: 1000, height: 1900 })).toContain("0.53:1"); // uncommon ratio falls back to decimal
    expect(buildPosterPrompt(input)).toContain("at least 10% clear of every edge");
  });
  it("DEF-1: clean-plate carries the ratio too (exact ratio = no cover-crop at all)", () => {
    expect(buildCleanPlatePrompt(input)).toContain("3:4 aspect ratio");
  });
  it("clean-plate forbids ADDED typography and reserves copy zones", () => {
    const p = buildCleanPlatePrompt(input);
    expect(p).toContain("Do NOT add any text");
    expect(p).toContain("top band");
    expect(p).toContain("right ~34%");
    expect(p).not.toContain("Render all text");
  });
  it("clean-plate + reference: product label lettering preserved", () => {
    const p = buildCleanPlatePrompt({ ...input, referenceImages: ["data:image/png;base64,x"] });
    expect(p).toContain("packaging or printed label must be preserved");
  });
  it("reference clauses identify images by order and state what stays the same", () => {
    const c = referenceClauses(["a.png", "b.png"]);
    expect(c).toContain("Image 1");
    expect(c).toContain("Image 2");
    expect(c).toContain("preserve the product's own packaging and printed labels exactly");
  });
});

describe("CliRuntime with a fake binary (resolution / timeout / abort / stdin)", () => {
  const fakeDir = path.join(tmpdir(), `oia-fake-bin-${Date.now()}`);
  mkdirSync(fakeDir, { recursive: true });
  // echoes args + stdin, then exits 0, lets tests pin the bridge invariants
  // (portable node fake, see fakeCli.ts; sh scripts cannot run on Windows)
  const fakeBin = writeRunnableCli(
    fakeDir,
    "fakecodex",
    `import process from "node:process";
process.stdout.write("ARGS:" + process.argv.slice(2).join(" ") + "\\n");
process.stdout.write("STDIN_BEGIN\\n");
process.stdin.pipe(process.stdout);
process.stdin.on("end", () => process.stdout.write("STDIN_END\\n"));
`,
  );
  afterAll(() => rmSync(fakeDir, { recursive: true, force: true }));

  it("spawns, passes args, and pipes the prompt via stdin (never argv)", async () => {
    const rt = new CliRuntime();
    const res = await rt.run({ bin: fakeBin, args: ["exec", "-", "--json"], stdin: "PROMPT-with-\", $injection", timeoutMs: 5_000 });
    expect(res.code).toBe(0);
    expect(res.stdout).toContain("ARGS:exec - --json");
    expect(res.stdout).toContain("STDIN_BEGIN\nPROMPT-with-\", $injection");
  });

  it("missing binary → ProviderError(provider_missing)", async () => {
    const rt = new CliRuntime();
    await expect(rt.run({ bin: "/nonexistent/codex-bin", args: ["--version"], timeoutMs: 2_000 })).rejects.toMatchObject({
      name: "ProviderError",
      errorClass: "provider_missing",
    });
  });

  it("timeout kills the child and reports timedOut", async () => {
    const sleepy = writeRunnableCli(fakeDir, "sleepy", "setTimeout(() => {}, 30000);\n");
    const rt = new CliRuntime();
    const res = await rt.run({ bin: sleepy, args: [], timeoutMs: 300 });
    expect(res.timedOut).toBe(true);
    expect(res.code).not.toBe(0);
  });

  it("AbortSignal kills the child and reports aborted", async () => {
    const sleepy = writeRunnableCli(fakeDir, "sleepy2", "setTimeout(() => {}, 30000);\n");
    const rt = new CliRuntime();
    const ac = new AbortController();
    setTimeout(() => ac.abort(), 200);
    const res = await rt.run({ bin: sleepy, args: [], timeoutMs: 30_000, signal: ac.signal });
    expect(res.aborted).toBe(true);
  });

  it("bridge.exec pins the invariant flag set on every role (TP.2)", async () => {
    const bridge = new CodexBridge({ bin: fakeBin, model: "test-model" });
    const schemaFile = path.join(fakeDir, "plan.schema.json");
    writeFileSync(schemaFile, "{}", "utf8");
    const lastMsg = path.join(fakeDir, "plan.json");
    const res = await bridge.exec({ role: "planner", prompt: "plan this", schemaFile, lastMessageFile: lastMsg, timeoutMs: 5_000, jobId: "test-job" });
    expect(res.stdout).toContain("--ignore-user-config");
    expect(res.stdout).toContain("--json");
    expect(res.stdout).toContain("-m test-model");
    expect(res.stdout).toContain("model_reasoning_effort");
    expect(res.stdout).toContain("--sandbox read-only");
    expect(res.stdout).toContain(`--output-schema ${schemaFile}`);
    expect(res.stdout).toContain(`-o ${lastMsg}`);
    // the prompt itself must NOT appear in argv
    const argsLine = res.stdout.split("\n").find((l) => l.startsWith("ARGS:"))!;
    expect(argsLine).not.toContain("plan this");
  });

  it("bridge.exec image role: workspace-write sandbox + -i reference files", async () => {
    const bridge = new CodexBridge({ bin: fakeBin });
    const res = await bridge.exec({
      role: "image", prompt: "$imagegen ...", images: ["/tmp/ref-a.png"], timeoutMs: 5_000, jobId: "test-job-2",
    });
    const argsLine = res.stdout.split("\n").find((l) => l.startsWith("ARGS:"))!;
    expect(argsLine).toContain("--sandbox workspace-write");
    expect(argsLine).toContain("-i /tmp/ref-a.png");
    expect(argsLine).not.toContain("$imagegen");
  });

  it("DA-1/--search is a TOP-LEVEL flag: it must PRECEDE the exec subcommand (teardown #19 · the bug real quota caught, argv order is now pinned for free)", async () => {
    const bridge = new CodexBridge({ bin: fakeBin, model: "test-model" });
    const schemaFile = path.join(fakeDir, "plan.schema.json");
    const lastMsg = path.join(fakeDir, "plan.json");
    const argsOf = async (opts: Partial<Parameters<CodexBridge["exec"]>[0]>): Promise<string[]> => {
      const res = await bridge.exec({ role: "planner", prompt: "p", schemaFile, lastMessageFile: lastMsg, timeoutMs: 5_000, jobId: "argv-pin", ...opts } as Parameters<CodexBridge["exec"]>[0]);
      const line = res.stdout.split("\n").find((l) => l.startsWith("ARGS:"))!;
      return line.slice("ARGS:".length).trim().split(/\s+/);
    };
    const withSearch = await argsOf({ search: true });
    expect(withSearch[0]).toBe("--search"); // 0.166.0 rejects it after the subcommand
    expect(withSearch[1]).toBe("exec");
    const without = await argsOf({});
    expect(without[0]).toBe("exec");
    expect(without).not.toContain("--search");
    // planner-only: the image path never sees the flag even if a caller sets it
    const imgRes = await bridge.exec({ role: "image", prompt: "$imagegen", search: true, timeoutMs: 5_000, jobId: "argv-pin-img" });
    const imgArgs = imgRes.stdout.split("\n").find((l) => l.startsWith("ARGS:"))!;
    expect(imgArgs).not.toContain("--search");
  });

  it("isAvailable=false when codex is not installed (missing binary)", async () => {
    const p = new CodexImageProvider(new CodexBridge({ bin: "/nonexistent/codex-bin" }));
    const diag = await p.isAvailable();
    expect(diag.ok).toBe(false);
    expect(diag.errorClass).toBe("provider_missing");
  });

  it("chat with opts.schema pins the CALLER's shape and returns its raw JSON (the 2026-11-10 real-run fix)", async () => {
    const fakeBin = writeRunnableCli(
      fakeDir,
      "chatschema",
      // writes the caller-shaped JSON to the -o scratch file, mimicking codex --output-schema
      `import { writeFileSync } from "node:fs";
import process from "node:process";
const i = process.argv.indexOf("-o");
process.stdout.write('{"type":"thread.started","thread_id":"t777"}\\n');
if (i >= 0) writeFileSync(process.argv[i + 1], JSON.stringify({ translations: ["Xin chào", "Giảm 50%"] }));
`,
    );
    const provider = new CodexLlmProvider(new CodexBridge({ bin: fakeBin }), { timeoutMs: 5_000 });
    const raw = await provider.chat(
      [
        { role: "system", content: "translate, ppt-translate.v1" },
        { role: "user", content: JSON.stringify({ texts: ["Hello", "50% off"], language: "Vietnamese" }) },
      ],
      { json: true, schema: { type: "object", properties: { translations: { type: "array", items: { type: "string" } } }, required: ["translations"] }, jobId: "chat-schema-pin" },
    );
    expect(JSON.parse(raw)).toEqual({ translations: ["Xin chào", "Giảm 50%"] }); // raw caller shape, NOT the poster plan
  });

  it("CodexLlmProvider: malformed plan → plan_parse_failed, exactly one attempt (G2)", async () => {
    // fake bridge whose plan file contains garbage
    const scratch = path.join(tmpdir(), `oia-badplan-${Date.now()}`);
    mkdirSync(scratch, { recursive: true });
    writeFileSync(path.join(scratch, "plan.json"), "this is not json");
    const fakeBin2 = writeRunnableCli(
      fakeDir,
      "planwriter",
      // writes plan.json into the io scratch dir passed via -o, mimicking codex
      `import { writeFileSync } from "node:fs";
import process from "node:process";
const i = process.argv.indexOf("-o");
process.stdout.write('{"type":"thread.started","thread_id":"t123"}\\n');
if (i >= 0) writeFileSync(process.argv[i + 1], "this is not json");
`,
    );
    const provider = new CodexLlmProvider(new CodexBridge({ bin: fakeBin2 }), { timeoutMs: 5_000 });
    await expect(provider.chat([{ role: "user", content: "banner trà sữa" }], { json: true })).rejects.toMatchObject({
      name: "ProviderError",
      errorClass: "plan_parse_failed",
    });
  });

  it("failing-mock injectable provider carries its class (shared test harness)", async () => {
    const llm = new FailingMockLlmProvider({ errorClass: "quota_exceeded" });
    await expect(llm.chat([{ role: "user", content: "x" }])).rejects.toMatchObject({ errorClass: "quota_exceeded" });
  });
});

// INTEGRATION: runs only when codex is logged in on this machine (skipped in CI)
describe("INTEGRATION codex (real CLI, real ChatGPT login)", () => {
  it("generates a real image when logged in to codex", { timeout: 360_000 }, async () => {
    const p = new CodexImageProvider();
    const diag = await p.isAvailable();
    if (!diag.ok) return; // soft skip, never fails CI
    const result = await p.generate({ prompt: "pastel poster, big bold text 'OIA OK'", width: 1024, height: 1365 });
    expect(result.provider).toBe("codex");
    expect(result.url).toMatch(/^data:image\/png;base64,/);
    expect(result.url.length).toBeGreaterThan(10_000);
    expect(result.width).toBeGreaterThan(0); // actual size recorded (TP.8)
    expect(result.provenance ?? "parsed").toBeTruthy();
  });

  it("planner returns a structured plan with blocks (CUJ 1 shape)", { timeout: 120_000 }, async () => {
    const provider = new CodexLlmProvider();
    const diag = await provider.isAvailable();
    if (!diag.ok) return;
    const plan = await provider.plan([
      { role: "system", content: "You are a poster planner. A sale banner naturally yields price/discount/date/name blocks." },
      { role: "user", content: 'banner trà sữa giảm 20% ngày 8/11' },
    ]);
    expect(plan.title.length).toBeGreaterThan(0);
    expect(plan.blocks?.length ?? 0).toBeGreaterThan(0);
    // roles are free-form by contract, accept price OR discount for the offer value
    const roles = (plan.blocks ?? []).map((b) => b.role.toLowerCase());
    expect(roles.some((r) => /price|discount|percent|sale/.test(r))).toBe(true);
    expect(roles.some((r) => /date/.test(r))).toBe(true);
  });
});

describe("STAGE-0 remediation: B1/A2/A4/A9/B8 fixes", () => {
  it("B1: a RELATIVE file path ref is read from the cwd, never an unwritten temp file", async () => {
    const { createScratchDir, removeScratchDir } = await import("../src/cli/runtime.js");
    const { materializeReference } = await import("../src/image/codex.js");
    const src = await createScratchDir("b1-src");
    const refDir = await createScratchDir("b1-refs");
    try {
      const abs = path.join(src, "my-product.png");
      writeFileSync(abs, PNG_1PX);
      const out = await materializeReference(path.relative(process.cwd(), abs), refDir);
      expect(readFileSync(out)).toEqual(PNG_1PX);
    } finally {
      await removeScratchDir(src);
      await removeScratchDir(refDir);
    }
  });

  it("a file: URL ref (packaged renderer artwork) is read via its path and copied out, never path.resolve'd", async () => {
    const { createScratchDir, removeScratchDir } = await import("../src/cli/runtime.js");
    const { materializeReference } = await import("../src/image/codex.js");
    const { pathToFileURL } = await import("node:url");
    const src = await createScratchDir("fileurl-src");
    const refDir = await createScratchDir("fileurl-refs");
    try {
      // non-ASCII dir + webp bytes: the copy must be ASCII-named (TP.9) and keep its real type
      const dir = path.join(src, "Tiến", "app.asar.unpacked", "studio");
      mkdirSync(dir, { recursive: true });
      const webp = Buffer.concat([Buffer.from("RIFF\0\0\0\0WEBPVP8 ", "latin1"), Buffer.alloc(16, 1)]);
      writeFileSync(path.join(dir, "cover.webp"), webp);
      const out = await materializeReference(pathToFileURL(path.join(dir, "cover.webp")).href, refDir);
      expect(path.dirname(out)).toBe(refDir);
      expect(path.basename(out)).toMatch(/^[\x20-\x7e]+\.webp$/);
      expect(readFileSync(out)).toEqual(webp);
    } finally {
      await removeScratchDir(src);
      await removeScratchDir(refDir);
    }
  });

  it("a data: URL ref keeps its real type and an empty source is refused", async () => {
    const { createScratchDir, removeScratchDir } = await import("../src/cli/runtime.js");
    const { materializeReference } = await import("../src/image/codex.js");
    const refDir = await createScratchDir("dataurl-refs");
    try {
      const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
      const out = await materializeReference(`data:image/png;base64,${jpg.toString("base64")}`, refDir);
      expect(out.endsWith(".jpg")).toBe(true); // the bytes decide, not the declared mime
      await expect(materializeReference("data:image/png;base64,", refDir)).rejects.toThrow(/empty/);
    } finally {
      await removeScratchDir(refDir);
    }
  });

  it("A2: the clean-plate clause is DERIVED from the shared geometry, provider and placement share one source", async () => {
    const { COPY_ZONE_GEOMETRY, cleanPlateZoneClause } = await import("@oia/schema");
    const { buildCleanPlatePrompt } = await import("../src/index.js");
    const clause = cleanPlateZoneClause(COPY_ZONE_GEOMETRY);
    expect(buildCleanPlatePrompt({ prompt: "x", width: 900, height: 1200 })).toContain(clause);
    // the numbers in the clause come from the geometry, not from a hand-copied string
    expect(clause).toContain(`~${Math.round(COPY_ZONE_GEOMETRY.topBand.heightR * 100)}%`);
    expect(clause).toContain(`~${Math.round(COPY_ZONE_GEOMETRY.sideBlock.widthR * 100)}%`);
  });

  it("A4: quota failure parses the reset time into ProviderError.resetAt", () => {
    const err = classifyCodexFailure({ code: 1, stdout: fx("error-quota.txt"), stderr: "", timedOut: false, aborted: false });
    expect(err.errorClass).toBe("quota_exceeded");
    expect((err as { resetAt?: string }).resetAt).toBe("2026-10-30T08:00:00Z");
  });

  it("A9: bridge.exec returns the CALLER's jobId (correlation survives the whole chain)", async () => {
    const bridge = new CodexBridge({ bin: fakeBin2() });
    const res = await bridge.exec({ role: "planner", prompt: "p", timeoutMs: 5_000, jobId: "job-correlation-1" });
    expect(res.jobId).toBe("job-correlation-1");
  });

  it("B8: pngSize rejects a truncated PNG (missing IEND), a partial flush cannot reach the canvas", () => {
    const truncated = PNG_1PX.subarray(0, PNG_1PX.length - 8); // cut the CRC tail
    expect(pngSize(truncated)).toBeUndefined();
    expect(pngSize(PNG_1PX)).toEqual({ width: 1, height: 1 });
  });

  it("A8: the fallback scan ignores images written at/below a cancel mark (late flush from a killed job)", async () => {
    const { noteCancelledImageJob } = await import("../src/index.js");
    const root = path.join(tmpdir(), `oia-cancel-ledger-${Date.now()}`);
    mkdirSync(path.join(root, "s1"), { recursive: true });
    const victim = path.join(root, "s1", "exec-victim.png");
    writeFileSync(victim, PNG_1PX); // written "around" the kill
    noteCancelledImageJob();
    // same mtime window → ignored
    expect(await newestGeneratedImage(60_000, root)).toBeNull();
    // a LATER image (mtime after the mark) is found
    const later = path.join(root, "s1", "exec-later.png");
    await new Promise((r) => setTimeout(r, 1100)); // past the 1s tolerance
    writeFileSync(later, PNG_1PX);
    expect(await newestGeneratedImage(60_000, root)).toBe(later);
  });

  function fakeBin2(): string {
    const d = path.join(tmpdir(), `oia-fake-echo-${Date.now()}`);
    mkdirSync(d, { recursive: true });
    return writeRunnableCli(
      d,
      "echo-bin",
      `import process from "node:process";
process.stdout.write('{"type":"thread.started","thread_id":"t"}\\n');
`,
    );
  }
});
