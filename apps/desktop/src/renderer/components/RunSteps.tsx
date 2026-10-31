import type { ReactNode } from "react";
import type { RunStep } from "../lib/run-steps.js";

/**
 * UI v1.1 R3 — the single progress line every metered flow shows: Planning ›
 * Painting › Composing, plus Stop. Quota is money (AGENTS.md): a running paid
 * step is always next to the control that cancels it.
 */
export function RunSteps({ steps, onStop, stopIcon }: { steps: RunStep[]; onStop?: () => void; stopIcon?: ReactNode }) {
  return (
    <div className="runSteps" role="status" aria-label="Progress" data-testid="run-steps">
      {steps.map((s, i) => (
        <span key={`${s.label}-${i}`} className={`runStep ${s.state}`}>
          {i > 0 && <span className="runStepSep" aria-hidden="true">›</span>}
          <span className="runStepDot" aria-hidden="true" />
          {s.label}
        </span>
      ))}
      {onStop && (
        <button className="runStepsStop" onClick={onStop}>{stopIcon}Stop</button>
      )}
    </div>
  );
}

/** The quiet "≈ N images" next to a paid action; renders nothing when there is no cost to show. */
export function CostHint({ text, testId }: { text: string | null; testId?: string }) {
  if (!text) return null;
  return <span className="costHint" data-testid={testId} title="What this uses on your provider">{text}</span>;
}
