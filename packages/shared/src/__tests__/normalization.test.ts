import { describe, expect, it } from "vitest";
import { buildAnswerSet, isCorrectGuess, matchVisionLabels, normalizeGuess, type VisionLabel, type WordEntry } from "../index";

describe("normalization", () => {
  it("normalizes spacing, punctuation, and simple plurals", () => {
    expect(normalizeGuess("  Doughnuts!!  ")).toBe("doughnut");
    expect(normalizeGuess("Alarm---Clocks")).toBe("alarm clock");
  });

  it("matches aliases through normalized answer sets", () => {
    const word: WordEntry = {
      id: "glasses",
      answer: "glasses",
      aliases: ["eyeglasses"],
      category: "accessories",
      difficulty: "easy"
    };

    expect(buildAnswerSet(word)).toEqual(new Set(["glass", "eyeglass"]));
    expect(isCorrectGuess("Eyeglasses", word)).toBe(true);
  });

  it("requires confidence threshold for AI matches", () => {
    const word: WordEntry = {
      id: "umbrella",
      answer: "umbrella",
      aliases: [],
      category: "outdoors",
      difficulty: "easy"
    };

    const labels: VisionLabel[] = [
      { label: "umbrella", normalized: "umbrella", confidence: 0.62 },
      { label: "parasol", normalized: "parasol", confidence: 0.91 }
    ];

    expect(matchVisionLabels(labels, word, 0.7)).toBeUndefined();
    expect(matchVisionLabels([{ ...labels[0], confidence: 0.82 }], word, 0.7)?.label).toBe("umbrella");
  });
});

