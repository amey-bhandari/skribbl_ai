import { nanoid } from "nanoid";
import { MAX_STROKE_POINTS, type Point, type StrokeRecord } from "@skribbl-ai/shared";

export class StrokeStore {
  private strokes: StrokeRecord[] = [];
  private activeStrokeId: string | null = null;

  startStroke(playerId: string, color: string, width: number, point: Point, createdAt = Date.now()): StrokeRecord {
    this.endStroke();

    const stroke: StrokeRecord = {
      id: nanoid(),
      playerId,
      color,
      width,
      points: [point],
      createdAt
    };

    this.strokes.push(stroke);
    this.activeStrokeId = stroke.id;
    return this.cloneStroke(stroke);
  }

  appendPoint(point: Point): StrokeRecord | null {
    const stroke = this.getActiveStroke();
    if (!stroke) {
      return null;
    }

    if (stroke.points.length >= MAX_STROKE_POINTS) {
      return this.cloneStroke(stroke);
    }

    stroke.points.push(point);
    return this.cloneStroke(stroke);
  }

  endStroke(): StrokeRecord | null {
    const stroke = this.getActiveStroke();
    this.activeStrokeId = null;
    return stroke ? this.cloneStroke(stroke) : null;
  }

  clear(): void {
    this.strokes = [];
    this.activeStrokeId = null;
  }

  hasInk(): boolean {
    return this.strokes.some((stroke) => stroke.points.length > 0);
  }

  getStrokes(): StrokeRecord[] {
    return this.strokes.map((stroke) => this.cloneStroke(stroke));
  }

  private getActiveStroke(): StrokeRecord | undefined {
    if (!this.activeStrokeId) {
      return undefined;
    }

    return this.strokes.find((stroke) => stroke.id === this.activeStrokeId);
  }

  private cloneStroke(stroke: StrokeRecord): StrokeRecord {
    return {
      ...stroke,
      points: stroke.points.map((point) => ({ ...point }))
    };
  }
}

