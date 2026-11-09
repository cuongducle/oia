import { Fragment } from "react";
import type { RunStep } from "../lib/run-steps.js";

/** Done steps keep their icon slot filled, a check reads "finished" at a glance
 *  where same-shape dots made done vs running a hue-guessing game. */
const CheckIcon = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5" /></svg>
);

/**
 * UI v1.1 R3: the single progress line every metered flow shows: Planning ›
 * Painting › Composing. Quota is money (AGENTS.md): the control that cancels a
 * running paid step lives in the composer right above this line, never in it.
 */
export function RunSteps({ steps }: { steps: RunStep[] }) {
  return (
    <div className="runSteps" role="status" aria-label="Progress" data-testid="run-steps">
      {steps.map((s, i) => (
        <Fragment key={`${s.label}-${i}`}>
          {i > 0 && (
            <span className={`runStepTrack ${steps[i - 1].state === "done" ? "done" : ""}`} aria-hidden="true" />
          )}
          <span className={`runStep ${s.state}`} aria-current={s.state === "running" ? "step" : undefined}>
            <span className="runStepIcon" aria-hidden="true">
              {s.state === "done" ? CheckIcon : <span className="runStepDot" />}
            </span>
            {s.label}
          </span>
        </Fragment>
      ))}
    </div>
  );
}

/** The quiet "≈ N images" next to a paid action; renders nothing when there is no cost to show. */
export function CostHint({ text, testId }: { text: string | null; testId?: string }) {
  if (!text) return null;
  return <span className="costHint" data-testid={testId} title="What this uses on your provider">{text}</span>;
}
