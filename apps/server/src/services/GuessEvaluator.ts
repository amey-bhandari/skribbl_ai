import { buildAnswerSet, matchVisionLabels, normalizeGuess, type VisionLabel, type WordEntry } from "@skribbl-ai/shared";

export class GuessEvaluator {
  evaluateGuess(text: string, word: WordEntry): { normalized: string; isCorrect: boolean } {
    const normalized = normalizeGuess(text);
    return {
      normalized,
      isCorrect: buildAnswerSet(word).has(normalized)
    };
  }

  matchVisionLabels(labels: VisionLabel[], word: WordEntry, minConfidence: number): VisionLabel | undefined {
    return matchVisionLabels(labels, word, minConfidence);
  }
}

