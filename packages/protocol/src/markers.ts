/**
 * Streaming markup embedded in `content`.
 * [[task::node::<uuid>]] [[task::tool::<uuid>]] [[canvas::canvas::<uuid>]]
 * <Collapse> </Content>
 */
export type Marker =
  | { kind: "task"; role: "node" | "tool" | "result"; uuid: string }
  | { kind: "canvas"; role: "canvas"; uuid: string };

const MARKER_RE = /\[\[(task|canvas)::(node|tool|result|canvas)::([0-9a-f]{32})\]\]/g;

export function parseMarkers(content: string): Marker[] {
  const out: Marker[] = [];
  for (const m of content.matchAll(MARKER_RE)) {
    if (m[1] === "task") {
      out.push({ kind: "task", role: m[2] as "node" | "tool" | "result", uuid: m[3] });
    } else {
      out.push({ kind: "canvas", role: "canvas", uuid: m[3] });
    }
  }
  return out;
}

export function stripMarkers(content: string): string {
  return content
    .replace(MARKER_RE, "")
    .replace(/<\/?Collapse>/g, "")
    .replace(/<\/?Content>/g, "")
    .replace(/<\/?Result>/g, "")
    .trim();
}
