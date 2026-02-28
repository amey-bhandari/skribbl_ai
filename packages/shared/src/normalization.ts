import type { VisionLabel, WordEntry } from "./types";

const PUNCTUATION_REGEX = /[^\p{L}\p{N}\s]+/gu;
const MULTISPACE_REGEX = /\s+/g;

function singularizeToken(token: string): string {
  if (token.length <= 3) {
    return token;
  }

  if (token.endsWith("ies") && token.length > 4) {
    return `${token.slice(0, -3)}y`;
  }

  if (token.endsWith("ses") && !token.endsWith("ss")) {
    return token.slice(0, -2);
  }

  if (token.endsWith("s") && !token.endsWith("ss")) {
    return token.slice(0, -1);
  }

  return token;
}

export function normalizeGuess(input: string): string {
  return input
    .toLowerCase()
    .replace(PUNCTUATION_REGEX, " ")
    .trim()
    .replace(MULTISPACE_REGEX, " ")
    .split(" ")
    .filter(Boolean)
    .map((token) => singularizeToken(token))
    .join(" ");
}

export function buildAnswerSet(word: WordEntry): Set<string> {
  const normalized = [word.answer, ...word.aliases]
    .map((value) => normalizeGuess(value))
    .filter(Boolean);

  return new Set(normalized);
}

export function isCorrectGuess(guess: string, word: WordEntry): boolean {
  const normalizedGuess = normalizeGuess(guess);
  return buildAnswerSet(word).has(normalizedGuess);
}

export function matchVisionLabels(labels: VisionLabel[], word: WordEntry, minConfidence: number): VisionLabel | undefined {
  const answers = buildAnswerSet(word);
  return labels.find((label) => label.confidence >= minConfidence && answers.has(label.normalized));
}

