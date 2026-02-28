import { z } from "zod";
import type { WordEntry } from "@skribbl-ai/shared";
import wordBankData from "../data/word-bank.json";

const wordEntrySchema = z.object({
  id: z.string(),
  answer: z.string(),
  aliases: z.array(z.string()),
  category: z.string(),
  difficulty: z.union([z.literal("easy"), z.literal("medium")])
});

export class WordBankService {
  private readonly words: WordEntry[];
  private readonly stats = new Map<string, { humans: number; ai: number; total: number }>();

  constructor() {
    this.words = z.array(wordEntrySchema).parse(wordBankData);
  }

  getWords(): WordEntry[] {
    return this.words.map((word) => ({
      ...word,
      aliases: [...word.aliases]
    }));
  }

  pickWord(lastWordId: string | null): WordEntry {
    if (this.words.length === 0) {
      throw new Error("Word bank is empty");
    }

    const candidates = this.words.filter((word) => word.id !== lastWordId);
    const source = candidates.length > 0 ? candidates : this.words;
    return source[Math.floor(Math.random() * source.length)]!;
  }

  recordResult(wordId: string, winner: "humans" | "ai" | "none"): void {
    const current = this.stats.get(wordId) ?? { humans: 0, ai: 0, total: 0 };
    current.total += 1;

    if (winner === "humans") {
      current.humans += 1;
    }

    if (winner === "ai") {
      current.ai += 1;
    }

    this.stats.set(wordId, current);
  }

  getWordStats(wordId: string): { humans: number; ai: number; total: number } | undefined {
    return this.stats.get(wordId);
  }
}
