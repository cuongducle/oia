import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { decodeSseText, reduceEvents } from "../src/index.js";
import { stripMarkers, parseMarkers } from "../src/index.js";
import { sceneCanvasSchema } from "@oia/schema";

const fixture = readFileSync(new URL("./fixtures/sse_poster.txt", import.meta.url), "utf8");

describe("golden replay: Oia SSE stream (local mock agent)", () => {
  const items = [...decodeSseText(fixture)];

  it("has at least 10 data events plus heartbeats", () => {
    const events = items.filter((i) => i.type === "event");
    const heartbeats = items.filter((i) => i.type === "heartbeat");
    expect(events.length).toBeGreaterThanOrEqual(10);
    expect(heartbeats.length).toBeGreaterThanOrEqual(2);
  });

  it("taskMeta timeline: Designer Agent (node) → Image Generator (tool)", () => {
    const { taskTimeline } = reduceEvents(items);
    const roles = taskTimeline.map((t) => `${t.content}:${t.type}`);
    expect(roles).toContain("Designer Agent:node");
    expect(roles).toContain("Image Generator:tool");
  });

  it("canvas msgMeta carries a valid Fabric JSON (clip Rect + Image)", () => {
    const { canvas } = reduceEvents(items);
    expect(canvas).not.toBeNull();
    const parsed = sceneCanvasSchema.safeParse(canvas!.canvas);
    expect(parsed.success).toBe(true);
    const types = parsed.success ? parsed.data.objects.map((o) => o.type) : [];
    expect(types).toContain("Rect");
    expect(types).toContain("Image");
  });

  it("BR-2' the Manager Agent (type result) closes taskMeta with <Result>", () => {
    const { taskTimeline } = reduceEvents(items);
    const last = taskTimeline.at(-1)!;
    expect(last.content).toBe("Manager Agent");
    expect(last.type).toBe("result");
    const raw = items.map((i) => (i.type === "event" ? i.event.content : "")).join("");
    expect(raw).toContain("<Result>[[task::result::");
  });

  it("BR-3' progressive canvas: each canvas uuid is replayed multiple times", () => {
    const canvasIds = new Map<string, number>();
    for (const i of items) {
      if (i.type !== "event") continue;
      for (const m of i.event.renderData.msgMeta) if (m.type === "canvas") canvasIds.set(m.id, (canvasIds.get(m.id) ?? 0) + 1);
    }
    expect(canvasIds.size).toBeGreaterThanOrEqual(1);
    const first = [...canvasIds.values()][0]!;
    expect(first).toBeGreaterThanOrEqual(3);
  });

  it("BR-4' narrative is English (Creating… / Finished creating…)", () => {
    const raw = items.map((i) => (i.type === "event" ? i.event.content : "")).join("");
    expect(raw).toContain("Creating");
    expect(raw).toContain("Finished creating");
  });

  it("BR-6' exportMeta rides the result event with an ASCII project name", () => {
    const resultItems = items.filter(
      (i) => i.type === "event" && i.event.renderData.exportMeta !== null,
    );
    expect(resultItems.length).toBeGreaterThan(0);
    const meta = resultItems.at(-1)!.event.renderData.exportMeta!;
    expect(meta.defaultExportType).toBe("jpg");
    expect(meta.projectName).toMatch(/^[ -~]+$/);
  });

  it("markers [[task::]]/[[canvas::]] parse + strip cleanly", () => {
    const { content } = reduceEvents(items);
    const markers = parseMarkers(content);
    expect(markers.some((m) => m.kind === "task" && m.role === "node")).toBe(true);
    expect(markers.some((m) => m.kind === "canvas")).toBe(true);
    expect(stripMarkers(content)).not.toMatch(/\[\[/);
  });
});

describe("STAGE-0 tolerant decoding of the new event fields (jobId / errorClass / cancelled)", () => {
  const mk = (extra: Record<string, unknown>) =>
    `data:${JSON.stringify({ msgId: 1, content: "", status: 0, error: "", renderData: { msgMeta: [], fileMeta: [], taskMeta: [], exportMeta: null }, brandId: 0, ...extra })}\n\n`;

  it("jobId + errorClass + attemptNumber + provider decode through chatEventSchema", () => {
    const items = [...decodeSseText(mk({ jobId: "j-123", error: "boom", errorClass: "quota_exceeded", attemptNumber: 1, provider: "codex" }))];
    const ev = items[0];
    expect(ev.type).toBe("event");
    if (ev.type === "event") {
      expect(ev.event.jobId).toBe("j-123");
      expect(ev.event.errorClass).toBe("quota_exceeded");
    }
    const reduced = reduceEvents(items);
    expect(reduced.jobId).toBe("j-123");
    expect(reduced.failure?.errorClass).toBe("quota_exceeded");
    expect(reduced.failure?.attemptNumber).toBe(1);
    expect(reduced.failure?.provider).toBe("codex");
  });

  it("terminal cancelled status decodes and reduces", () => {
    const items = [...decodeSseText(mk({ status: "cancelled", afterCompletion: true }))];
    const ev = items[0];
    expect(ev.type === "event" && ev.event.status).toBe("cancelled");
    expect(reduceEvents(items).cancelled).toBe(true);
  });

  it("legacy events (no new fields) decode unchanged", () => {
    const items = [...decodeSseText(mk({}))];
    expect(items[0].type).toBe("event");
    const reduced = reduceEvents(items);
    expect(reduced.cancelled).toBe(false);
    expect(reduced.failure).toBeUndefined();
  });
});
