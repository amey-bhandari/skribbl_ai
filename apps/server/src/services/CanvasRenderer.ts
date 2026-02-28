import { createCanvas } from "@napi-rs/canvas";
import { CANVAS_SIZE, type StrokeRecord } from "@skribbl-ai/shared";

export class CanvasRenderer {
  constructor(private readonly size = CANVAS_SIZE) {}

  render(strokes: StrokeRecord[]): Buffer {
    const canvas = createCanvas(this.size, this.size);
    const context = canvas.getContext("2d");

    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, this.size, this.size);

    for (const stroke of strokes) {
      if (stroke.points.length === 0) {
        continue;
      }

      context.strokeStyle = stroke.color;
      context.lineWidth = stroke.width;
      context.lineCap = "round";
      context.lineJoin = "round";

      if (stroke.points.length === 1) {
        const [point] = stroke.points;
        context.beginPath();
        context.arc(point.x, point.y, stroke.width / 2, 0, Math.PI * 2);
        context.fillStyle = stroke.color;
        context.fill();
        continue;
      }

      context.beginPath();
      context.moveTo(stroke.points[0]!.x, stroke.points[0]!.y);
      for (const point of stroke.points.slice(1)) {
        context.lineTo(point.x, point.y);
      }
      context.stroke();
    }

    return canvas.toBuffer("image/png");
  }
}

