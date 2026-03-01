import type { AiDifficulty, StrokeRecord, VisionLabel, WordEntry } from "@skribbl-ai/shared";

export type AiProviderInput = {
  imageBuffer: Buffer;
  strokes: StrokeRecord[];
  candidates: WordEntry[];
  aiDifficulty: AiDifficulty;
};

export interface AiProvider {
  readonly configured: boolean;
  readonly name: "google_vision" | "local_doodle";
  detectLabels(input: AiProviderInput): Promise<VisionLabel[]>;
  getDebugStatus?(): Record<string, unknown> | Promise<Record<string, unknown>>;
}
