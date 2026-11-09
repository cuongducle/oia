import { describe, it, expect } from "vitest";
import { parseMockStepDelayMs, MOCK_STEP_DELAY_MAX_MS } from "../src/mockPace.js";

/**
 * The shot-busy pace knob, the ONLY mechanism that makes the mid-run UI
 * photographable. It must never misparse into a gate-hanging value.
 */
describe("mockPace, OIA_MOCK_STEP_DELAY_MS parsing", () => {
  it("unset, empty, invalid, zero and negative all mean instant", () => {
    expect(parseMockStepDelayMs(undefined)).toBe(0);
    expect(parseMockStepDelayMs("")).toBe(0);
    expect(parseMockStepDelayMs("abc")).toBe(0);
    expect(parseMockStepDelayMs("0")).toBe(0);
    expect(parseMockStepDelayMs("-5")).toBe(0);
    expect(parseMockStepDelayMs("12.9")).toBe(12); // floors, no rounding up
  });
  it("caps at the ceiling so a typo can never hang a gate", () => {
    expect(parseMockStepDelayMs(String(MOCK_STEP_DELAY_MAX_MS + 1))).toBe(MOCK_STEP_DELAY_MAX_MS);
    expect(parseMockStepDelayMs("999999999")).toBe(MOCK_STEP_DELAY_MAX_MS);
  });
});
