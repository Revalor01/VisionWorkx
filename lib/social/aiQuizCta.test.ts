import { describe, expect, it } from "vitest";
import { AI_QUIZ_URL, promotesAiQuiz, aiQuizLink, aiQuizCtaInstruction } from "./aiQuizCta";

describe("aiQuizCta", () => {
  it("promotes the quiz only for VisionWorkx and Revalor LLC", () => {
    expect(promotesAiQuiz("VisionWorkx")).toBe(true);
    expect(promotesAiQuiz("Revalor LLC")).toBe(true);
    expect(promotesAiQuiz("Revalor Kids")).toBe(false);
    expect(promotesAiQuiz("Revalor Wellness")).toBe(false);
  });

  it("tags the link with the platform for attribution", () => {
    expect(aiQuizLink("facebook")).toBe(`${AI_QUIZ_URL}?src=facebook`);
  });

  it("gives a ~1-in-4 CTA instruction with the link for quiz brands, nothing otherwise", () => {
    const vw = aiQuizCtaInstruction("VisionWorkx");
    expect(vw).toContain(AI_QUIZ_URL);
    expect(vw).toMatch(/1 in 4|quarter/i);
    expect(aiQuizCtaInstruction("Revalor Kids")).toBe("");
  });
});
