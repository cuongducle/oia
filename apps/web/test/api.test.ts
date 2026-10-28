import { describe, expect, it } from "vitest";
import { POST as createSession } from "../app/api/chat/session/route";
import { POST as sendChat } from "../app/api/chat/send/route";
import { chatEventSchema } from "@oia/schema";
import { stripMarkers } from "@oia/protocol";

describe("BR-API /api/chat/session", () => {
  it("returns CommonResult {code:0, data.sessionId}", async () => {
    const res = await createSession(new Request("http://x/api/chat/session", { method: "POST", body: "{}" }));
    const json = await res.json();
    expect(json.code).toBe(0);
    expect(json.data.sessionId).toBeGreaterThan(0);
  });
});

describe("BR-API /api/chat/send (SSE)", () => {
  it("missing prompt → 400 CommonResult code≠0", async () => {
    const res = await sendChat(new Request("http://x/api/chat/send", { method: "POST", body: "{}" }));
    expect(res.status).toBe(400);
    expect((await res.json()).code).not.toBe(0);
  });

  it("content-type text/event-stream; data events valid; narrative EN; ends with </Content>", async () => {
    const res = await sendChat(
      new Request("http://x/api/chat/send", {
        method: "POST",
        body: JSON.stringify({ prompt: "coffee milk tea poster 20% off pastel" }),
      }),
    );
    expect(res.headers.get("content-type")).toContain("text/event-stream");
    const text = await res.text();
    const lines = text.split("\n").filter((l) => l.startsWith("data:"));
    expect(lines.length).toBeGreaterThan(4);
    const events = [];
    for (const l of lines) {
      const payload = l.slice(5);
      if (payload === "[Heartbeat]") continue;
      const parsed = chatEventSchema.safeParse(JSON.parse(payload));
      expect(parsed.success).toBe(true);
      if (parsed.success) events.push(parsed.data);
    }
    const raw = events.map((e) => e.content).join("");
    expect(raw).toMatch(/Creating/);
    expect(raw).toContain("</Content>");
    expect(stripMarkers(raw)).not.toMatch(/\[\[/);
    // event result mang exportMeta (BR-6)
    const resultEv = events.find((e) => e.content.startsWith("<Result>"));
    expect(resultEv?.renderData.exportMeta).toBeTruthy();
  });
});
