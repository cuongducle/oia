import { useEffect, useRef, useState } from "react";
import type { RunStep } from "../lib/run-steps.js";
import { RunSteps } from "./RunSteps.js";

/** Streamed events may each end with their own newline — collapse the pile-ups
 *  so the feed keeps one quiet blank line between entries, not two. */
function normalizeFeed(text: string): string {
  return text.trim().replace(/\n{3,}/g, "\n\n");
}

/** Below this distance from the bottom (px) the feed follows new lines; further
 *  up, the reader scrolled away on purpose and owns the position. */
const FOLLOW_MARGIN_PX = 48;

/**
 * UI v1.1 R3 pass 2 — the run-progress sheet: stepper + streaming notes live in
 * ONE raised card (the same sheet language as the composer), so the mid-run
 * state reads as a designed moment instead of two floating fragments. While
 * busy: centered steps + a live-following notes feed with a live dot and an
 * honest elapsed timer (design-direction: neutral "working" language, never
 * result verbs). After the run: the ✓ summary line + the notes one click away.
 */
export function RunPanel(props: {
  busy: boolean;
  steps: RunStep[];
  /** Streamed narrative (planner text, research notes). Empty string hides the feed. */
  narrative: string;
  notesOpen: boolean;
  onToggleNotes: (open: boolean) => void;
  /** Run start (ms epoch) — drives the elapsed seconds while busy. */
  startedAt: number | null;
  /** Generation wall-time once the result has landed; null before/while busy. */
  summarySeconds: number | null;
}) {
  const { busy, steps, narrative, notesOpen, onToggleNotes, startedAt, summarySeconds } = props;
  const bodyRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy || !startedAt) return;
    setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    const t = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000))), 1000);
    return () => clearInterval(t);
  }, [busy, startedAt]);

  // follow the feed only while the reader is at the tail — scrolling up to read
  // must win over the stream yanking the position back down
  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    const onScroll = () => {
      followRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < FOLLOW_MARGIN_PX;
    };
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => el.removeEventListener("scroll", onScroll);
  }, [narrative]);

  useEffect(() => {
    if (busy && followRef.current && bodyRef.current) {
      bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
    }
  }, [busy, narrative]);

  if (!busy && !narrative && summarySeconds == null) return null;

  return (
    <section className={`runPanel${narrative ? " hasNotes" : ""}`} aria-label="Run progress" data-testid="run-panel">
      {busy ? (
        <RunSteps steps={steps} />
      ) : (
        summarySeconds != null && (
          <p className="genSummary" role="status">✓ Generated in {summarySeconds}s</p>
        )
      )}
      {narrative && (
        <details className="aiNotes" open={notesOpen} onToggle={(e) => onToggleNotes(e.currentTarget.open)}>
          <summary>
            <svg className="aiChevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            {busy && <span className="aiNotesLive" aria-hidden="true" />}
            <span className="aiNotesLabel">{busy ? "Assistant working" : "AI notes"}</span>
            {busy && startedAt && <span className="aiNotesTimer" title="Elapsed time">{elapsed}s</span>}
          </summary>
          <div className="aiNotesBody" ref={bodyRef} aria-live="polite">{normalizeFeed(narrative)}</div>
        </details>
      )}
    </section>
  );
}
