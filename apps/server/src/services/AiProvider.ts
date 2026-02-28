import type { StrokeRecord, VisionLabel, WordEntry } from "@skribbl-ai/shared";

export type AiProviderInput = {
  imageBuffer: Buffer;
  strokes: StrokeRecord[];
  candidates: WordEntry[];
};

export interface AiProvider {
  readonly configured: boolean;
  readonly name: "google_vision" | "local_doodle";
  detectLabels(input: AiProviderInput): Promise<VisionLabel[]>;
}
