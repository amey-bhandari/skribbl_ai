import { describe, expect, it } from "vitest";
import type { StrokeRecord, WordEntry } from "@skribbl-ai/shared";
import { LocalDoodleProvider } from "../services/LocalDoodleProvider.js";

const TEST_STROKES: StrokeRecord[] = [
  {
    id: "stroke-1",
    playerId: "player-1",
    color: "#000000",
    width: 8,
    createdAt: 0,
    points: [
      { x: 48, y: 48 },
      { x: 180, y: 180 },
      { x: 320, y: 240 }
    ]
  }
];

describe("LocalDoodleProvider", () => {
  it("loads both easy and hard prototype sets in-process", () => {
    const provider = new LocalDoodleProvider({
      maxLabels: 5
    });

    expect(provider.configured).toBe(true);

    const status = provider.getDebugStatus();
    expect(status.status).toBe("ok");
    expect(status.mode).toBe("in_process");
    expect((status.difficulties as Record<string, { labelCount: number }>).hard.labelCount).toBe(86);
    expect((status.difficulties as Record<string, { labelCount: number }>).easy.labelCount).toBe(345);
  });

  it("restricts hard mode guesses to the provided candidate labels", async () => {
    const provider = new LocalDoodleProvider({
      maxLabels: 5
    });

    const labels = await provider.detectLabels({
      imageBuffer: Buffer.alloc(0),
      strokes: TEST_STROKES,
      aiDifficulty: "hard",
      candidates: [buildWord("umbrella")]
    });

    expect(labels).toEqual([
      {
        label: "umbrella",
        confidence: labels[0]!.confidence,
        normalized: "umbrella"
      }
    ]);
  });

  it("returns no labels for an empty sketch", async () => {
    const provider = new LocalDoodleProvider({
      maxLabels: 5
    });

    const labels = await provider.detectLabels({
      imageBuffer: Buffer.alloc(0),
      strokes: [],
      aiDifficulty: "easy",
      candidates: [buildWord("umbrella")]
    });

    expect(labels).toEqual([]);
  });
});

function buildWord(answer: string): WordEntry {
  return {
    id: answer,
    answer,
    aliases: [],
    category: "test",
    difficulty: "easy"
  };
}
