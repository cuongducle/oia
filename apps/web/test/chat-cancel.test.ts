import { describe, it, expect, beforeAll } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.OIA_DATA_DIR = mkdtempSync(path.join(tmpdir(), "oia-slice2-"));
// force the offline pair — a dev machine with IMAGE_PROVIDER=codex in the shell must not
// make this suite burn real quota
process.env.IMAGE_PROVIDER = "mock";
process.env.LLM_PROVIDER = "mock";

import { POST as sendChat } from "../app/api/chat/send/route";
import { POST as cancelChat } from "../app/api/chat/cancel/route";
import { GET as providerStatus } from "../app/api/provider/status/route";
import { getRuntime } from "../libs/runtime";
import { chatEventSchema, type ChatEvent } from "@oia/schema";
import { FailingMockLlmProvider, FailingMockImageProvider } from "@oia/providers";

function parseSse(text: string): ChatEvent[] {
  const out: ChatEvent[] = [];
  for (const line of text.split("\n")) {
    if (!line.startsWith("data:")) continue;
    const payload = line.slice(5);
    if (payload.trim() === "[Heartbeat]") continue;
    out.push(JSON.parse(payload) as ChatEvent);
  }
  return out;
}

describe("STAGE-0 TP.6: pre-flight — zero metered attempts on a doomed job", () => {
  it("a not-logged-in provider aborts before generation: one failure event, errorClass set, no canvas", async () => {
    const rt = await getRuntime();
    const original = rt.chat;
    rt.chat = {
      ...original,
      llm: new FailingMockLlmProvider({ errorClass: "not_logged_in", available: false }),
      image: new FailingMockImageProvider({ errorClass: "not_logged_in", available: false }),
    };
    try {
      const res = await sendChat(new Request("http://x/api/chat/send", { method: "POST", body: JSON.stringify({ prompt: "banner trà sữa" }) }));
      const events = parseSse(await res.text());
      expect(events.length).toBe(1);
      const failure = events[0];
      expect(failure.errorClass).toBe("not_logged_in");
      expect(failure.attemptNumber).toBe(0); // zero attempts spent
      expect(JSON.stringify(events)).not.toContain("[[canvas::");
    } finally {
      rt.chat = original;
    }
  });

  it("provider status exposes capabilities + quota counters (mock labeled isMock)", async () => {
    const res = await providerStatus();
    const j = await res.json();
    expect(j.code).toBe(0);
    expect(j.data.image.capabilities.isMock).toBe(true); // forced mock pair above
    expect(j.data.quota).toMatchObject({ planner: expect.any(Number), image: expect.any(Number) });
  });
});

describe("STAGE-0 TP.5: cancellation — Stop kills the job and emits the terminal cancelled event", () => {
  it("a running job is cancelled via /api/chat/cancel; every event carries the jobId", async () => {
    const rt = await getRuntime();
    const original = rt.chat;
    // slow mock: the planner hangs long enough for the cancel to land mid-run
    rt.chat = {
      ...original,
      llm: new FailingMockLlmProvider({ errorClass: "timeout", latencyMs: 10_000 }),
      image: original.image,
    };
    let events: ChatEvent[] = [];
    try {
      const resPromise = sendChat(new Request("http://x/api/chat/send", { method: "POST", body: JSON.stringify({ prompt: "poster" }) }));
      const res = await resPromise;
      const textPromise = res.text();

      // wait for the abort to land (latency mock → signal aborts the sleep loop)
      await new Promise((r) => setTimeout(r, 300));
      // the job registered its controller; cancel via the API without a jobId → 400
      const noId = await cancelChat(new Request("http://x/api/chat/cancel", { method: "POST", body: "{}" }));
      expect(noId.status).toBe(400);

      // jobId is discoverable from the registry (the client reads it from the first event)
      const { jobControllers } = await import("../libs/job-controllers");
      const jobId = [...jobControllers().keys()][0];
      expect(jobId).toBeTruthy();
      const cancelRes = await cancelChat(new Request("http://x/api/chat/cancel", { method: "POST", body: JSON.stringify({ jobId }) }));
      const cj = await cancelRes.json();
      expect(cj.data.cancelled).toBe(true);

      events = parseSse(await textPromise);
      const terminal = events.find((e) => e.status === "cancelled");
      expect(terminal).toBeDefined();
      expect(terminal!.jobId).toBe(jobId);
      expect(terminal!.afterCompletion).toBe(false); // no canvas had been produced
      expect(events.filter((e) => e.jobId)).toHaveLength(events.length); // correlation on every event that has one
      for (const e of events) if (e.msgId) expect(chatEventSchema.safeParse(e).success).toBe(true);
      // registry released
      expect(jobControllers().has(jobId)).toBe(false);
    } finally {
      rt.chat = original;
    }
  });

  it("cancelling an unknown jobId is a clean no-op (idempotent Stop)", async () => {
    const res = await cancelChat(new Request("http://x/api/chat/cancel", { method: "POST", body: JSON.stringify({ jobId: "nope" }) }));
    const j = await res.json();
    expect(j.code).toBe(0);
    expect(j.data.cancelled).toBe(false);
  });
});

describe("STAGE-0 TP.7 (Slice 2): handoff by projectId — localStorage blobs are gone", () => {
  it("no app code writes the oia:scene / oia:project localStorage keys anymore", async () => {
    const { readFile } = await import("node:fs/promises");
    const files = ["app/page.tsx", "app/editor/page.tsx"];
    for (const f of files) {
      const src = await readFile(path.join(process.cwd(), f), "utf8");
      expect(src.includes('localStorage.setItem("oia:scene"'), f).toBe(false);
      expect(src.includes('localStorage.setItem("oia:project"'), f).toBe(false);
      expect(src.includes('localStorage.getItem("oia:scene"'), f).toBe(false);
    }
  });
});
