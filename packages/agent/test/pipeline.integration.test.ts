import { describe, expect, it } from "vitest";
import { runDesignerAgent, foldAscii } from "../src/index.js";
import { decodeSseText, reduceEvents, parseMarkers, stripMarkers } from "@oia/protocol";
import { chatEventSchema, sceneCanvasSchema, type ChatEvent } from "@oia/schema";
import type { ImageProvider, LlmProvider } from "@oia/providers";

/**
 * INTEGRATION: agent → SSE text → protocol decode → schema — the real production path
 * (the server serializes events; the client decodes data: lines). Constraints = the protocol invariants.
 */
const plan = JSON.stringify({
  title: "Coffee milk tea poster 20% off",
  imagePrompt: "pastel iced milk coffee poster",
  copy: "20% OFF",
  outline: ["pastel layout", "centered coffee cup"],
});

const llm: LlmProvider = { name: "stub", async chat() { return plan; } };
const image: ImageProvider = {
  name: "stub",
  async generate({ width, height }) { return { url: `https://cdn.test/${width}x${height}.png`, provider: "stub", model: "x" }; },
};

async function runAndSerialize(input: Parameters<typeof runDesignerAgent>[0]): Promise<string> {
  let out = "";
  for await (const ev of runDesignerAgent(input, { llm, image })) {
    out += `data:${JSON.stringify(ev)}\n\n`;
    out += `data:[Heartbeat]\n\n`; // interleaved like the real server
  }
  return out;
}

describe("INT-1 agent→SSE→protocol→schema (pipeline production)", () => {
  it("decoding the SSE text: every event passes chatEventSchema + protocol invariants hold", async () => {
    const text = await runAndSerialize({ prompt: "iced milk coffee poster 20% off", outlineMode: true, pages: 2 });
    const items = [...decodeSseText(text)];

    const events = items.filter((i) => i.type === "event");
    const heartbeats = items.filter((i) => i.type === "heartbeat");
    expect(events.length).toBeGreaterThan(8);
    expect(heartbeats.length).toBeGreaterThanOrEqual(events.length); // one heartbeat per event

    for (const i of events) expect(chatEventSchema.safeParse(i.event).success, JSON.stringify(i.event).slice(0, 80)).toBe(true);

    const { content, taskTimeline, canvas } = reduceEvents(events);
    // orchestration matches the contract
    expect(taskTimeline.map((t) => `${t.content}:${t.type}`)).toEqual([
      "Designer Agent:node", "Image Generator:tool", "Manager Agent:result",
    ]);
    expect(canvas).not.toBeNull();
    expect(sceneCanvasSchema.safeParse(canvas!.canvas).success).toBe(true);
    // markers + narrative
    const markers = parseMarkers(content);
    for (const role of ["node", "tool", "result"] as const)
      expect(markers.some((m) => m.kind === "task" && m.role === role)).toBe(true);
    expect(markers.some((m) => m.kind === "canvas")).toBe(true);
    expect(stripMarkers(content)).not.toMatch(/\[\[/);
    expect(content).toMatch(/Creating/);
    expect(content).toMatch(/Finished creating/);
    expect(content).toMatch(/Outline:/); // outline mode on
  });

  it("pages=2 → 2 distinct canvas ids after decode; brandId throughout", async () => {
    const text = await runAndSerialize({ prompt: "2-page deck", pages: 2, brandGuidance: "pastel", brandId: 3 });
    const events = [...decodeSseText(text)].filter((i) => i.type === "event");
    const canvasIds = new Set(events.flatMap((i) => i.event.renderData.msgMeta.map((m) => m.id)));
    expect(canvasIds.size).toBe(2);
    expect(events.every((i) => i.event.brandId === 3)).toBe(true);
  });

  it("exportMeta projectName is ASCII-folded (foldAscii), like the file card", async () => {
    const text = await runAndSerialize({ prompt: "coffee poster pastel" });
    const events = [...decodeSseText(text)].filter((i) => i.type === "event");
    const result = events.find((e) => e.event.content.startsWith("<Result>"))!;
    const name = result.event.renderData.exportMeta!.projectName;
    expect(name).toBe(foldAscii(name));
    expect(name).toMatch(/^[ -~]+$/);
  });
});
