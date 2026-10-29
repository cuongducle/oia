import { chatEventSchema, type ChatEvent } from "@oia/schema";

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

/** Reduce events into the final state: taskMeta timeline, latest canvas, marker-stripped text, and the first failure (TP.4). */
export function reduceEvents(items: StreamItem[]): {
  content: string;
  taskTimeline: ChatEvent["renderData"]["taskMeta"];
  canvas: ChatEvent["renderData"]["msgMeta"][number] | null;
  jobId?: string;
  failure?: { errorClass?: string; provider?: string; attemptNumber?: number; message: string };
  cancelled: boolean;
} {
  let content = "";
  let taskTimeline: ChatEvent["renderData"]["taskMeta"] = [];
  let canvas: ChatEvent["renderData"]["msgMeta"][number] | null = null;
  let jobId: string | undefined;
  let failure: { errorClass?: string; provider?: string; attemptNumber?: number; message: string } | undefined;
  let cancelled = false;
  for (const item of items) {
    if (item.type !== "event") continue;
    const { event } = item;
    content += event.content;
    if (event.jobId) jobId = event.jobId;
    if (event.status === "cancelled") cancelled = true;
    if (event.error && !failure) {
      failure = { errorClass: event.errorClass, provider: event.provider, attemptNumber: event.attemptNumber, message: event.error };
    }
    if (event.renderData.taskMeta.length) taskTimeline = event.renderData.taskMeta;
    for (const meta of event.renderData.msgMeta) if (meta.type === "canvas") canvas = meta;
  }
  return { content, taskTimeline, canvas, jobId, failure, cancelled };
}
