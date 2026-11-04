/**
 * The mock pair's optional step pacing. shot-busy photographs the mid-run UI;
 * a mock run finishes in ~1s, faster than any poll-and-capture. A per-call
 * delay (registry-only env knob, T3 pattern) stretches the SAME real pipeline
 * to a photographable tempo — no event interception, no test hooks anywhere in
 * the shipping wire path. Default 0 = instant, exactly the old behavior.
 */
export const MOCK_STEP_DELAY_ENV = "OIA_MOCK_STEP_DELAY_MS";
export const MOCK_STEP_DELAY_MAX_MS = 2000;

/** Non-negative integer ms, invalid or negative falls back to 0, capped so a
 *  typo can never hang a gate. */
export function parseMockStepDelayMs(raw: string | undefined): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(MOCK_STEP_DELAY_MAX_MS, Math.floor(n));
}

export async function holdMockPace(delayMs: number): Promise<void> {
  if (delayMs > 0) await new Promise((r) => setTimeout(r, delayMs));
}
