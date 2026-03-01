import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeGuess, type StrokeRecord, type VisionLabel } from "@skribbl-ai/shared";

const RASTER_SIZE = 64;
const RASTER_PADDING = 5;
const BRUSH_RADIUS = 1.35;
const DIRECTION_BINS = 16;

type PrototypeFile = {
  metadata?: Record<string, unknown>;
  labels?: Record<
    string,
    {
      samples?: number;
      raster?: number[];
      signature?: number[];
    }
  >;
};

type LabelPrototype = {
  label: string;
  raster: number[];
  signature: number[];
  samples: number;
};

type PrototypeStatus = {
  prototypePath: string;
  labelCount: number;
  metadata: Record<string, unknown>;
};

type StrokePath = Array<[number, number]>;

export class QuickDrawPrototypeMatcher {
  readonly prototypePath: string;
  readonly metadata: Record<string, unknown>;
  private readonly prototypes: Map<string, LabelPrototype>;

  constructor(fileName: "quickdraw_prototypes.json" | "quickdraw_prototypes_full.json") {
    this.prototypePath = resolveDataPath(fileName);
    const payload = loadPrototypeFile(this.prototypePath);
    this.metadata = payload.metadata;
    this.prototypes = payload.prototypes;
  }

  predict(
    strokes: StrokeRecord[],
    topK: number,
    candidateLabels?: readonly string[] | null
  ): VisionLabel[] {
    const normalizedStrokes = normalizePayloadStrokes(strokes);
    if (normalizedStrokes.length === 0) {
      return [];
    }

    const labels = candidateLabels ? uniqueExistingLabels(candidateLabels, this.prototypes) : [...this.prototypes.keys()];
    if (labels.length === 0) {
      throw new Error("No candidate labels matched the local doodle prototypes");
    }

    const raster = rasterizeStrokes(normalizedStrokes);
    const signature = buildSignature(normalizedStrokes);

    return labels
      .map((label) => {
        const prototype = this.prototypes.get(label)!;
        const rasterScore = cosineSimilarity(raster, prototype.raster);
        const signatureScore = cosineSimilarity(signature, prototype.signature);
        const score = (0.82 * rasterScore) + (0.18 * signatureScore);

        return {
          label,
          confidence: roundTo(calibrateConfidence(score), 4),
          normalized: normalizeGuess(label)
        } satisfies VisionLabel;
      })
      .sort((left, right) => right.confidence - left.confidence || left.label.localeCompare(right.label))
      .slice(0, Math.max(1, topK));
  }

  getStatus(): PrototypeStatus {
    return {
      prototypePath: this.prototypePath,
      labelCount: this.prototypes.size,
      metadata: this.metadata
    };
  }
}

function loadPrototypeFile(prototypePath: string): {
  metadata: Record<string, unknown>;
  prototypes: Map<string, LabelPrototype>;
} {
  const raw = fs.readFileSync(prototypePath, "utf8");
  const payload = JSON.parse(raw) as PrototypeFile;
  const entries = Object.entries(payload.labels ?? {});
  const prototypes = new Map<string, LabelPrototype>();

  for (const [label, entry] of entries) {
    prototypes.set(label, {
      label,
      raster: toNumberArray(entry.raster),
      signature: toNumberArray(entry.signature),
      samples: Number(entry.samples ?? 0)
    });
  }

  return {
    metadata: payload.metadata ?? {},
    prototypes
  };
}

function toNumberArray(values: number[] | undefined): number[] {
  return (values ?? []).map((value) => Number(value));
}

function resolveDataPath(fileName: string): string {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const candidates = [
    path.resolve(process.cwd(), "services/doodle_classifier/data", fileName),
    path.resolve(process.cwd(), "../services/doodle_classifier/data", fileName),
    path.resolve(process.cwd(), "../../services/doodle_classifier/data", fileName),
    path.resolve(currentDir, "../../../services/doodle_classifier/data", fileName),
    path.resolve(currentDir, "../../../../services/doodle_classifier/data", fileName)
  ];

  const existing = candidates.find((candidate) => fs.existsSync(candidate));
  if (!existing) {
    throw new Error(`Could not locate ${fileName} in services/doodle_classifier/data`);
  }

  return existing;
}

function normalizePayloadStrokes(strokes: StrokeRecord[]): StrokePath[] {
  return strokes
    .map((stroke) =>
      stroke.points
        .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        .map((point) => [Number(point.x), Number(point.y)] as [number, number])
    )
    .filter((stroke) => stroke.length > 0);
}

function uniqueExistingLabels(labels: readonly string[], prototypes: Map<string, LabelPrototype>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const label of labels) {
    if (seen.has(label) || !prototypes.has(label)) {
      continue;
    }

    seen.add(label);
    result.push(label);
  }

  return result;
}

function rasterizeStrokes(strokes: StrokePath[]): number[] {
  const { transformed } = normalizeToCanvas(strokes);
  const pixels = new Array<number>(RASTER_SIZE * RASTER_SIZE).fill(0);

  for (const stroke of transformed) {
    if (stroke.length === 1) {
      stampDisk(pixels, stroke[0]![0], stroke[0]![1], BRUSH_RADIUS);
      continue;
    }

    for (let index = 0; index < stroke.length - 1; index += 1) {
      drawSegment(pixels, stroke[index]!, stroke[index + 1]!, BRUSH_RADIUS);
    }
  }

  return pixels;
}

function buildSignature(strokes: StrokePath[]): number[] {
  const { width, height, totalPoints } = normalizeToCanvas(strokes);
  const histogram = new Array<number>(DIRECTION_BINS).fill(0);
  let totalLength = 0;
  let segmentCount = 0;

  for (const stroke of strokes) {
    for (let index = 0; index < stroke.length - 1; index += 1) {
      const start = stroke[index]!;
      const end = stroke[index + 1]!;
      const dx = end[0] - start[0];
      const dy = end[1] - start[1];
      const length = Math.hypot(dx, dy);
      if (length <= 1e-6) {
        continue;
      }

      const angle = Math.atan2(dy, dx);
      const bucket = Math.floor(((angle + Math.PI) / (2 * Math.PI)) * DIRECTION_BINS) % DIRECTION_BINS;
      histogram[bucket] += length;
      totalLength += length;
      segmentCount += 1;
    }
  }

  const histogramTotal = histogram.reduce((sum, value) => sum + value, 0) || 1;
  const normalizedHistogram = histogram.map((value) => value / histogramTotal);

  const aspectRatio = (width + 1) / (height + 1);
  const aspectFeature = 0.5 + (Math.atan(Math.log(aspectRatio)) / Math.PI);
  const densityFeature = clamp(totalLength / Math.max(16, width + height + 1));
  const strokeFeature = clamp(strokes.length / 12);
  const segmentFeature = clamp(segmentCount / 96);
  const pointFeature = clamp(totalPoints / 160);

  return [
    ...normalizedHistogram,
    roundTo(aspectFeature, 6),
    roundTo(densityFeature, 6),
    roundTo(strokeFeature, 6),
    roundTo(segmentFeature, 6),
    roundTo(pointFeature, 6)
  ];
}

function normalizeToCanvas(strokes: StrokePath[]): {
  transformed: StrokePath[];
  width: number;
  height: number;
  totalPoints: number;
} {
  const allPoints = strokes.flat();
  if (allPoints.length === 0) {
    return {
      transformed: [],
      width: 1,
      height: 1,
      totalPoints: 0
    };
  }

  const xs = allPoints.map((point) => point[0]);
  const ys = allPoints.map((point) => point[1]);
  const minX = Math.min(...xs);
  const maxX = Math.max(...xs);
  const minY = Math.min(...ys);
  const maxY = Math.max(...ys);
  const width = Math.max(1, maxX - minX);
  const height = Math.max(1, maxY - minY);

  const drawable = Math.max(1, RASTER_SIZE - (RASTER_PADDING * 2));
  const scale = drawable / Math.max(width, height);
  const scaledWidth = width * scale;
  const scaledHeight = height * scale;
  const offsetX = ((RASTER_SIZE - scaledWidth) / 2) - (minX * scale);
  const offsetY = ((RASTER_SIZE - scaledHeight) / 2) - (minY * scale);

  return {
    transformed: strokes.map((stroke) => stroke.map((point) => [point[0] * scale + offsetX, point[1] * scale + offsetY])),
    width,
    height,
    totalPoints: allPoints.length
  };
}

function drawSegment(pixels: number[], start: [number, number], end: [number, number], radius: number): void {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const steps = Math.max(1, Math.floor(Math.max(Math.abs(dx), Math.abs(dy)) * 2));

  for (let step = 0; step <= steps; step += 1) {
    const t = step / steps;
    stampDisk(pixels, start[0] + (dx * t), start[1] + (dy * t), radius);
  }
}

function stampDisk(pixels: number[], x: number, y: number, radius: number): void {
  const minX = Math.max(0, Math.floor(x - radius));
  const maxX = Math.min(RASTER_SIZE - 1, Math.ceil(x + radius));
  const minY = Math.max(0, Math.floor(y - radius));
  const maxY = Math.min(RASTER_SIZE - 1, Math.ceil(y + radius));
  const radiusSquared = radius * radius;

  for (let py = minY; py <= maxY; py += 1) {
    for (let px = minX; px <= maxX; px += 1) {
      const distanceSquared = ((px + 0.5) - x) ** 2 + ((py + 0.5) - y) ** 2;
      if (distanceSquared <= radiusSquared) {
        pixels[(py * RASTER_SIZE) + px] = 1;
      }
    }
  }
}

function cosineSimilarity(left: number[], right: number[]): number {
  let numerator = 0;
  let leftNorm = 0;
  let rightNorm = 0;

  for (let index = 0; index < left.length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    numerator += leftValue * rightValue;
    leftNorm += leftValue * leftValue;
    rightNorm += rightValue * rightValue;
  }

  if (leftNorm <= 1e-12 || rightNorm <= 1e-12) {
    return 0;
  }

  return numerator / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

function calibrateConfidence(score: number): number {
  return clamp(clamp(score) ** 0.8);
}

function clamp(value: number, minimum = 0, maximum = 1): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function roundTo(value: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}
