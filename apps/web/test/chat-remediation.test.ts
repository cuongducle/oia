import { describe, it, expect, afterEach } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
process.env.OIA_DATA_DIR = mkdtempSync(path.join(tmpdir(), "oia-remediation-"));
process.env.IMAGE_PROVIDER = "mock";
process.env.LLM_PROVIDER = "mock";

import { POST as sendChat } from "../app/api/chat/send/route";
import { getRuntime } from "../libs/runtime";
import { MockImageProvider } from "@oia/providers";
import type { ImageProvider, ProviderCapabilities } from "@oia/providers";
import type { ChatEvent } from "@oia/schema";

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

const inFlightGuard = () => (globalThis as unknown as { __oiaMeteredInFlight?: Set<string> }).__oiaMeteredInFlight;

/** A mock provider masquerading as metered (isMock:false) — explicit wrapper:
 *  spreading a class instance drops prototype methods (that bug bit these tests once). */
function meteredImage(): ImageProvider {
  const inner = new MockImageProvider();
  const caps = { ...inner.capabilities, isMock: false } as ProviderCapabilities;
  return {
    name: inner.name,
    capabilities: caps,
    generate: (input) => inner.generate(input),
    isAvailable: () => inner.isAvailable(),
  };
}

async function setImage(img: ImageProvider) {
  const r = await getRuntime();
  const orig = (r.chat as { image: unknown }).image;
  (r.chat as { image: unknown }).image = img;
  return orig as ImageProvider;
}

/**
 * STAGE-0 remediation tests (A1/G3/A5):
 * A1 — the SSE wire never carries base64 artwork (events are assetized to /api/files/<key>)
 * G3 — one metered job in flight; a concurrent one is refused rate_limited, zero attempts
 * A5 — a retry with retryOf reuses the cached plan (zero planner turns)
 */
describe("A1: no base64 blobs on the SSE wire", () => {
  it("every canvas event references /api/files assets — artwork and thumbnail deduped", async () => {
    const res = await sendChat(new Request("http://x/api/chat/send", { method: "POST", body: JSON.stringify({ prompt: "banner trà sữa giảm 20%" }) }));
    const text = await res.text();
    expect(text).not.toContain("data:image"); // nothing base64 crosses the wire
    const events = parseSse(text);
    const canvasEvents = events.flatMap((e) => e.renderData.msgMeta);
    expect(canvasEvents.length).toBeGreaterThan(0);
    for (const meta of canvasEvents) {
      if (meta.thumbnail) expect(meta.thumbnail).toMatch(/^\/api\/files\//);
      for (const o of meta.canvas.objects ?? []) {
        if (typeof o.src === "string" && o.src.length > 0) expect(o.src).toMatch(/^\/api\/files\//);
      }
    }
    // artwork and its thumbnail are ONE asset (md5 dedupe)
    const first = canvasEvents[0];
    const artwork = first.canvas.objects.find((o) => o.type === "Image");
    expect(artwork?.src).toBe(first.thumbnail);
  });
});

describe("G3: one metered job in flight per app instance", () => {
  let originalImage: ImageProvider | undefined;
  afterEach(async () => {
    delete (globalThis as unknown as { __oiaMeteredInFlight?: Set<string> }).__oiaMeteredInFlight;
    if (originalImage) await setImage(originalImage); // never poison later describes
  });

  it("a second concurrent metered job is refused rate_limited with attemptNumber 0", async () => {
    originalImage = await setImage(meteredImage());
    (globalThis as unknown as { __oiaMeteredInFlight?: Set<string> }).__oiaMeteredInFlight = new Set(["someone-else-job"]);
    const res = await sendChat(new Request("http://x/api/chat/send", { method: "POST", body: JSON.stringify({ prompt: "banner" }) }));
    const events = parseSse(await res.text());
    expect(events).toHaveLength(1);
    expect(events[0].errorClass).toBe("rate_limited");
    expect(events[0].attemptNumber).toBe(0);
    expect(events[0].provider).toBe("mock"); // the configured image provider's name
    expect(JSON.stringify(events)).not.toContain("[[canvas::");
  });

  it("the guard releases the slot when the run finishes", async () => {
    originalImage = await setImage(meteredImage());
    const res = await sendChat(new Request("http://x/api/chat/send", { method: "POST", body: JSON.stringify({ prompt: "banner" }) }));
    await res.text();
    expect(inFlightGuard()?.size ?? 0).toBe(0);
    // a follow-up run goes through (slot free)
    const second = await sendChat(new Request("http://x/api/chat/send", { method: "POST", body: JSON.stringify({ prompt: "banner 2" }) }));
    const events = parseSse(await second.text());
    expect(events.at(-1)?.content).toBe("</Content>");
  });

  it("mock providers bypass the guard (CI/tests stay parallel-friendly)", async () => {
    originalImage = await setImage(new MockImageProvider());
    (globalThis as unknown as { __oiaMeteredInFlight?: Set<string> }).__oiaMeteredInFlight = new Set(["someone-else-job"]);
    const res = await sendChat(new Request("http://x/api/chat/send", { method: "POST", body: JSON.stringify({ prompt: "banner" }) }));
    const events = parseSse(await res.text());
    expect(events.at(-1)?.content).toBe("</Content>"); // full run — no guard
  });
});

describe("A5: stage-aware retry reuses the cached plan", () => {
  it("a retry with retryOf spends zero planner turns (image stage only)", async () => {
    const r = await getRuntime();
    let llmCalls = 0;
    const origLlm = r.chat.llm;
    (r.chat as { llm: unknown }).llm = {
      ...origLlm,
      async chat(...args: Parameters<typeof origLlm.chat>) { llmCalls++; return origLlm.chat(...args); },
    };
    try {
      // first run stashes the plan for the session
      const first = await sendChat(new Request("http://x/api/chat/send", { method: "POST", body: JSON.stringify({ prompt: "banner trà sữa" }) }));
      await first.text();
      expect(llmCalls).toBe(1);

      // the retry with retryOf: planner skipped, image stage runs
      const { chatSessions } = await getRuntime();
      const sid = chatSessions.recent(1)[0].id;
      const retry = await sendChat(new Request("http://x/api/chat/send", { method: "POST", body: JSON.stringify({ prompt: "banner trà sữa", sessionId: sid, retryOf: "failed-job" }) }));
      const retryEvents = parseSse(await retry.text());
      expect(llmCalls).toBe(1); // NOT 2 — the cached plan rode again
      expect(retryEvents.at(-1)?.content).toBe("</Content>");
    } finally {
      (r.chat as { llm: unknown }).llm = origLlm;
    }
  });
});
