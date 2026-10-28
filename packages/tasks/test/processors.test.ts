import { describe, expect, it } from "vitest";
import { parseOutline } from "../src/processors.js";

describe("BR-PROC processors", () => {
  it("parseOutline: valid JSON keeps slide order", () => {
    const o = parseOutline(JSON.stringify({
      title: "Q3 Review",
      slides: [{ title: "A", bullets: ["1", "2"], imagePrompt: "chart" }, { title: "B", bullets: [], imagePrompt: "team" }],
    }));
    expect(o.title).toBe("Q3 Review");
    expect(o.slides.map((s) => s.title)).toEqual(["A", "B"]);
  });
  it("parseOutline: clamps to maxSlides (5..30 per schema)", () => {
    const many = { title: "t", slides: Array.from({ length: 30 }, (_, i) => ({ title: `s${i}`, bullets: [], imagePrompt: "x" })) };
    expect(parseOutline(JSON.stringify(many), 5).slides).toHaveLength(5);
  });
  it("parseOutline: missing slides[] falls back to one slide (demo/mock still works)", () => {
    const o = parseOutline('{"title":"x","imagePrompt":"p","copy":"C"}');
    expect(o.slides).toHaveLength(1);
    expect(o.slides[0]).toMatchObject({ imagePrompt: "p", bullets: ["C"] });
  });
});
