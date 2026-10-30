import { describe, expect, it, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ApiKeyStore, generateApiKey, hashKey } from "../src/apikeys.js";

let dir: string; let store: ApiKeyStore;
beforeAll(async () => {
  dir = mkdtempSync(path.join(tmpdir(), "pf-keys-"));
  store = new ApiKeyStore(path.join(dir, "keys.json"));
});

  describe("BR-KEY — API keys for agents (pf-... format)", () => {
  it("key format pf-<32hex>, hash sha256 deterministic", () => {
    const { plaintext, hashed } = generateApiKey();
    expect(plaintext).toMatch(/^pf-[0-9a-f]{32}$/);
    expect(hashed).toBe(hashKey(plaintext));
    expect(hashed).toHaveLength(64);
  });
    it("create → list leaks no plaintext/hash; exposes preview + createdAt", async () => {
    const { record, plaintext } = await store.create("my agent key");
    expect(record.name).toBe("my agent key");
    const listed = store.list();
    expect(listed).toHaveLength(1);
    expect(listed[0].hashed).toBe("");
    expect(JSON.stringify(listed)).not.toContain(plaintext);
    expect(listed[0].preview).toBe(plaintext.slice(0, 11));
  });
    it("verify: correct key passes; wrong key → null; expired → null", async () => {
      const { plaintext } = await store.create("expired", 0.00001); // expires almost immediately
    const ok = await store.create("valid");
    expect(store.verify(ok.plaintext)).not.toBeNull();
    expect(store.verify("pf-deadbeef")).toBeNull();
    await new Promise((r) => setTimeout(r, 900)); // TTL 0.00001 ngày = 864ms
    expect(store.verify(plaintext)).toBeNull(); // TTL qua
  });
    it("persist: reloading from file keeps the records", async () => {
    const s2 = new ApiKeyStore(path.join(dir, "keys.json"));
    await s2.load();
    expect(s2.list().length).toBeGreaterThanOrEqual(3);
  });
  it("regression (reorg 4d): verify persists lastUsedAt — the For Agents table must not show a value the next boot contradicts", async () => {
    const { plaintext } = await store.create("touched");
    expect(store.verify(plaintext)).not.toBeNull();
    await new Promise((r) => setTimeout(r, 150)); // fire-and-forget save settles
    const s3 = new ApiKeyStore(path.join(dir, "keys.json"));
    await s3.load();
    const reloaded = s3.list().find((r) => r.name === "touched");
    expect(reloaded?.lastUsedAt).not.toBeNull();
  });
  it("revoke xóa key", async () => {
    const { record } = await store.create("tobe-revoked");
    expect(await store.revoke(record.id)).toBe(true);
    expect(store.list().find((r) => r.id === record.id)).toBeUndefined();
  });
});

/** T2 regression — corrupt api-keys.json is quarantined (never blanked+overwritten); saves are atomic. */
describe("TP.7 durable load — ApiKeyStore", () => {
  it("corrupt file → quarantined; a fresh key round-trips on the NEW file", async () => {
    const { mkdtempSync, writeFileSync, readFileSync, readdirSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const pathMod = await import("node:path");
    const dir = mkdtempSync(pathMod.join(tmpdir(), "pf-corrupt-keys-"));
    const file = pathMod.join(dir, "api-keys.json");
    writeFileSync(file, "{oops");

    const { ApiKeyStore } = await import("../src/apikeys.js");
    const store = new ApiKeyStore(file);
    await store.load();
    expect(store.list()).toHaveLength(0);

    const created = await store.create("recovered"); // save() must not touch the quarantined bytes
    const q = readdirSync(dir).find((f) => f.startsWith("api-keys.json.corrupt-"));
    expect(q).toBeDefined();
    expect(readFileSync(pathMod.join(dir, q!), "utf8")).toBe("{oops");

    const reopened = new ApiKeyStore(file);
    await reopened.load();
    expect(reopened.verify(created.plaintext)?.id).toBe(created.record.id); // fresh file round-trips
  });
});
