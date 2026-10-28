import { chatEventSchema, type ChatEvent } from "@pixforge/schema";

export type StreamItem =
  | { type: "heartbeat" }
  | { type: "event"; event: ChatEvent }
  | { type: "malformed"; raw: string };

/** Decode a raw SSE stream into items. Non-data lines are ignored. */
export function* decodeSseText(text: string): Generator<StreamItem> {
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("data:")) continue;
    const payload = trimmed.slice(5);
    if (payload === "[Heartbeat]") {
      yield { type: "heartbeat" };
      continue;
    }
    try {
      const parsed = chatEventSchema.safeParse(JSON.parse(payload));
      if (parsed.success) yield { type: "event", event: parsed.data };
      else yield { type: "malformed", raw: payload };
    } catch {
      yield { type: "malformed", raw: payload };
    }
  }
}

/** Reduce events into the final state: taskMeta timeline, latest canvas, marker-stripped text. */
export function reduceEvents(items: StreamItem[]): {
  content: string;
  taskTimeline: ChatEvent["renderData"]["taskMeta"];
  canvas: ChatEvent["renderData"]["msgMeta"][number] | null;
} {
  let content = "";
  let taskTimeline: ChatEvent["renderData"]["taskMeta"] = [];
  let canvas: ChatEvent["renderData"]["msgMeta"][number] | null = null;
  for (const item of items) {
    if (item.type !== "event") continue;
    const { event } = item;
    content += event.content;
    if (event.renderData.taskMeta.length) taskTimeline = event.renderData.taskMeta;
    for (const meta of event.renderData.msgMeta) if (meta.type === "canvas") canvas = meta;
  }
  return { content, taskTimeline, canvas };
}
