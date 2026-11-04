import { describe, expect, it, beforeAll, afterAll } from "vitest";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { CliRuntime, type CliRunOptions, type CliRunResult } from "../src/cli/runtime.js";
import { RuntimeProvisioner } from "../src/cli/provision.js";
import { imageGenAccessForPlan, planTypeFromAuthJson, readCodexAccount } from "../src/cli/codex-account.js";
import { CodexBridge, imageToolUnavailable } from "../src/codex/bridge.js";
import { CodexImageProvider } from "../src/image/codex.js";

/** D17 — a Free ChatGPT login has no Codex image tool; the app must say so before any spend. */

const FREE_PLAN_STDOUT = readFileSync(new URL("./fixtures/stdout-imagegen-unavailable.jsonl", import.meta.url), "utf8");

let dir: string;
beforeAll(() => {
  dir = path.join(tmpdir(), `oia-codex-account-${process.pid}-${Date.now()}`);
  mkdirSync(dir, { recursive: true });
});
afterAll(() => rmSync(dir, { recursive: true, force: true }));

function authJson(plan: string | undefined): string {
  const claims = plan === undefined ? {} : { "https://api.openai.com/auth": { chatgpt_plan_type: plan } };
  const payload = Buffer.from(JSON.stringify({ email: "seller@example.com", ...claims })).toString("base64url");
  return JSON.stringify({ auth_mode: "chatgpt", tokens: { id_token: `e30.${payload}.sig`, access_token: "x", refresh_token: "y" } });
}

function codexHomeWith(name: string, content: string | null): string {
  const home = path.join(dir, name);
  mkdirSync(home, { recursive: true });
  if (content !== null) writeFileSync(path.join(home, "auth.json"), content);
  return home;
}

class FakeRuntime extends CliRuntime {
  constructor(private readonly behaviour: (opts: CliRunOptions) => CliRunResult) {
    super();
  }
  override async run(opts: CliRunOptions): Promise<CliRunResult> {
    return this.behaviour(opts);
  }
}

const ok = (stdout: string): CliRunResult => ({ stdout, stderr: "", code: 0, timedOut: false, aborted: false, durationMs: 1 });

describe("plan claim parsing", () => {
  it("reads chatgpt_plan_type from the id_token payload", () => {
    expect(planTypeFromAuthJson(authJson("free"))).toBe("free");
    expect(planTypeFromAuthJson(authJson("go"))).toBe("go");
  });
  it("garbage never throws and never warns: malformed JSON, token, or missing claim → null", () => {
    expect(planTypeFromAuthJson("{not json")).toBeNull();
    expect(planTypeFromAuthJson(JSON.stringify({ tokens: { id_token: "only-one-part" } }))).toBeNull();
    expect(planTypeFromAuthJson(JSON.stringify({ tokens: { id_token: "a.%%%.c" } }))).toBeNull();
    expect(planTypeFromAuthJson(JSON.stringify({ OPENAI_API_KEY: "sk-x" }))).toBeNull();
    expect(planTypeFromAuthJson(authJson(undefined))).toBeNull();
  });
  it("only a plan known to lack the tool is 'unavailable'; unseen plans stay 'unknown'", () => {
    expect(imageGenAccessForPlan("free")).toBe("unavailable");
    expect(imageGenAccessForPlan("FREE")).toBe("unavailable");
    expect(imageGenAccessForPlan("go")).toBe("available");
    expect(imageGenAccessForPlan("plus")).toBe("available");
    expect(imageGenAccessForPlan("some-new-plan")).toBe("unknown");
    expect(imageGenAccessForPlan(null)).toBe("unknown");
  });
  it("a missing auth.json reads as unknown, not as an error", async () => {
    expect(await readCodexAccount(path.join(dir, "does-not-exist"))).toEqual({ planType: null, imageGen: "unknown" });
  });
});

describe("RuntimeProvisioner.status carries the plan (warning before the first generation)", () => {
  function provisioner(codexHome: string, loginLine: string): RuntimeProvisioner {
    const binDir = path.join(dir, `bin-${path.basename(codexHome)}`);
    mkdirSync(binDir, { recursive: true });
    writeFileSync(path.join(binDir, "codex"), "#!/bin/sh\n", { mode: 0o755 });
    const rt = new FakeRuntime((o) => (o.args[0] === "--version" ? ok("codex-cli 0.166.0\n") : ok(`${loginLine}\n`)));
    return new RuntimeProvisioner({
      managedDir: path.join(dir, "none"),
      codexHome,
      runtime: rt,
      env: { PATH: binDir },
      platform: "darwin",
      arch: "arm64",
      includeWellKnown: false,
    });
  }

  it("Free ChatGPT login → ready but imageGen unavailable", async () => {
    const st = await provisioner(codexHomeWith("free", authJson("free")), "Logged in using ChatGPT").status({ force: true });
    expect(st).toMatchObject({ state: "ready", loginMethod: "chatgpt", planType: "free", imageGen: "unavailable" });
  });
  it("Go ChatGPT login → imageGen available", async () => {
    const st = await provisioner(codexHomeWith("go", authJson("go")), "Logged in using ChatGPT").status({ force: true });
    expect(st).toMatchObject({ state: "ready", planType: "go", imageGen: "available" });
  });
  it("an unreadable auth.json keeps the runtime ready and does not warn", async () => {
    const st = await provisioner(codexHomeWith("broken", "{oops"), "Logged in using ChatGPT").status({ force: true });
    expect(st).toMatchObject({ state: "ready", planType: null, imageGen: "unknown" });
  });
  it("API-key login never reads the ChatGPT plan", async () => {
    const st = await provisioner(codexHomeWith("apikey", authJson("free")), "Logged in using API key").status({ force: true });
    expect(st.loginMethod).toBe("api-key");
    expect(st.imageGen).toBeUndefined();
  });
});

describe("Free-plan image run: exit 0, no PNG → capability_unsupported (not a retryable no_output)", () => {
  it("the real Free-plan stdout is recognised", () => {
    expect(imageToolUnavailable(FREE_PLAN_STDOUT)).toBe(true);
    expect(imageToolUnavailable('{"type":"item.completed","item":{"text":"Generated the image."}}')).toBe(false);
  });
  it("CodexImageProvider maps it to capability_unsupported", async () => {
    const imagesRoot = path.join(dir, "empty-generated-images");
    mkdirSync(imagesRoot, { recursive: true });
    const bridge = new CodexBridge({ bin: "codex", runtime: new FakeRuntime(() => ok(FREE_PLAN_STDOUT)) });
    const provider = new CodexImageProvider(bridge, { imagesRoot, timeoutMs: 5_000 });
    await expect(provider.generate({ prompt: "a red apple", width: 1024, height: 1024 })).rejects.toMatchObject({
      name: "ProviderError",
      errorClass: "capability_unsupported",
    });
  });
});
