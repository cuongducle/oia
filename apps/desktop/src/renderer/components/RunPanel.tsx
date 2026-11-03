import { useEffect, useRef, useState } from "react";
import type { RunStep } from "../lib/run-steps.js";
import { RunSteps } from "./RunSteps.js";

/**
 * UI v1.1 R3 pass 2 — the run-progress sheet: stepper + streaming notes live in
 * ONE raised card (the same sheet language as the composer), so the mid-run
 * state reads as a designed moment instead of two floating fragments. While
 * busy: centered steps + an open, auto-following notes feed with a live dot and
 * an honest elapsed timer (design-direction: neutral "working" language, never
 * result verbs). After the run: the ✓ summary line + the notes one click away.
 */
/** Streamed events may each end with their own newline — collapse the pile-ups
 *  so the feed keeps one quiet blank line between entries, not two. */
function normalizeFeed(text: string): string {
  return text.trim().replace(/\n{3,}/g, "\n\n");
}

export function RunPanel(props: {
  busy: boolean;
  steps: RunStep[];
  /** Streamed narrative (planner text, research notes). Empty string hides the feed. */
  narrative: string;
  notesOpen: boolean;
  onToggleNotes: (open: boolean) => void;
  /** Run start (ms epoch) — drives the elapsed seconds while busy. */
  startedAt: number | null;
  /** The ✓ summary replaces the stepper once the result has landed (exact gate text). */
  summary: string | null;
}) {
  const { busy, steps, narrative, notesOpen, onToggleNotes, startedAt, summary } = props;
  const bodyRef = useRef<HTMLDivElement>(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!busy || !startedAt) return;
    setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000)));
    const t = setInterval(() => setElapsed(Math.max(0, Math.round((Date.now() - startedAt) / 1000))), 1000);
    return () => clearInterval(t);
  }, [busy, startedAt]);

  // live-follow the feed while it streams; once idle the user owns the scroll
  useEffect(() => {
    if (busy && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight;
  }, [busy, narrative]);

  if (!busy && !narrative && !summary) return null;

  return (
    <section className={`runPanel${narrative ? " hasNotes" : ""}`} aria-label="Run progress" data-testid="run-panel">
      {busy ? (
        <RunSteps steps={steps} />
      ) : (
        summary && <p className="genSummary" role="status">{summary}</p>
      )}
      {narrative && (
        <details className="aiNotes" open={notesOpen} onToggle={(e) => onToggleNotes(e.currentTarget.open)}>
          <summary>
            <svg className="aiChevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="m9 6 6 6-6 6" /></svg>
            {busy && <span className="aiNotesLive" aria-hidden="true" />}
            <span className="aiNotesLabel">{busy ? "Assistant working" : "AI notes"}</span>
            {busy && startedAt && <span className="aiNotesTimer" title="Elapsed time">{elapsed}s</span>}
          </summary>
          <div className="aiNotesBody" ref={bodyRef}>{normalizeFeed(narrative)}</div>
        </details>
      )}
    </section>
  );
}
