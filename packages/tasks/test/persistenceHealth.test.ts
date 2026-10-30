import { describe, it, expect, onTestFinished } from "vitest";
import { mkdtempSync, chmodSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { ChatSessionStore } from "../src/projects.js";
import { persistenceWriteFailures } from "../src/persistenceHealth.js";

/**
 * B7 regression — a failed store save must be RECORDED, never silently dropped.
 * The old `void this.save()` (ChatSessionStore.create) vanished the rejection:
 * memory claimed the record was saved, disk never saw it, and the loss only
 * surfaced after a restart. Failure is injected for real: a read-only data dir
 * makes the temp-file write fail with EACCES (atomicWriteJson's funnel).
 */

const asRoot = typeof process.getuid === "function" && process.getuid() === 0;
/** chmod-based EACCES does not stop root (some CI containers) — skip honestly. */
const itNonRoot = asRoot ? it.skip : it;

async function flushWrite(): Promise<void> {
  // the fire-and-forget save runs on the microtask + fs thread pool — give it a beat
  await new Promise((r) => setTimeout(r, 60));
}

function fixture(): { dir: string; file: string; store: ChatSessionStore } {
  const dir = mkdtempSync(path.join(tmpdir(), "oia-persist-health-"));
  const file = path.join(dir, "chats.json");
  return { dir, file, store: new ChatSessionStore(file) };
}

describe("B7 persistence health — write failures are recorded, recovery clears them", () => {
  itNonRoot("fire-and-forget save (create) — EACCES is recorded, no unhandled rejection, session still works in memory", async () => {
    const { dir, file, store } = fixture();
    onTestFinished(() => chmodSync(dir, 0o700)); // never leave a locked dir behind
    await store.load();

    chmodSync(dir, 0o500); // the data dir becomes unwritable
    const s = store.create("doomed session");
    expect(store.get(s.id)?.name).toBe("doomed session"); // memory keeps serving
    await flushWrite();

    const mine = persistenceWriteFailures().find((f) => f.file === file);
    expect(mine).toBeDefined(); // OLD code: nothing anywhere — the failure evaporated
    expect(mine?.code).toBe("EACCES");
    expect(mine?.failedWrites).toBeGreaterThanOrEqual(1);
    // the test completing at all is the no-unhandled-rejection gate
  });

  itNonRoot("awaited save (append) — rejects to the caller AND lands in the same registry", async () => {
    const { dir, file, store } = fixture();
    onTestFinished(() => chmodSync(dir, 0o700));
    await store.load();
    const s = store.create("before the lock");
    await flushWrite();

    chmodSync(dir, 0o500);
    await expect(
      store.append(s.id, "hello", { content: "world" }),
    ).rejects.toMatchObject({ code: "EACCES" }); // honest propagation, unchanged

    const mine = persistenceWriteFailures().find((f) => f.file === file);
    expect(mine).toBeDefined();
    expect(mine?.code).toBe("EACCES");
  });

  itNonRoot("recovery — one successful write clears the file's entry (health shows CURRENT failures only)", async () => {
    const { dir, file, store } = fixture();
    onTestFinished(() => chmodSync(dir, 0o700));
    await store.load();
    const s = store.create("will recover");
    await flushWrite();

    chmodSync(dir, 0o500);
    store.create("fails once");
    await flushWrite();
    expect(persistenceWriteFailures().some((f) => f.file === file)).toBe(true);

    chmodSync(dir, 0o700); // disk healthy again
    await store.append(s.id, "after recovery", { content: "saved" }); // awaited, must succeed
    expect(persistenceWriteFailures().some((f) => f.file === file)).toBe(false); // cleared
    // and the accumulated in-memory state did land on disk
    const reopened = new ChatSessionStore(file);
    await reopened.load();
    expect(reopened.get(s.id)?.messages.at(-1)?.content).toBe("saved");
  });
});
