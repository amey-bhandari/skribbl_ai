import { useEffect, useRef, useState, type PointerEvent } from "react";
import type { Point, StrokeRecord } from "@skribbl-ai/shared";

type CanvasBoardProps = {
  strokes: StrokeRecord[];
  canDraw: boolean;
  color: string;
  width: number;
  size: number;
  onStrokeStart: (point: Point) => void;
  onStrokePoint: (point: Point) => void;
  onStrokeEnd: () => void;
};

type DraftStroke = {
  color: string;
  width: number;
  points: Point[];
};

export function CanvasBoard({
  strokes,
  canDraw,
  color,
  width,
  size,
  onStrokeStart,
  onStrokePoint,
  onStrokeEnd
}: CanvasBoardProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [draftStroke, setDraftStroke] = useState<DraftStroke | null>(null);
  const drawingRef = useRef(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) {
      return;
    }

    const context = canvas.getContext("2d");
    if (!context) {
      return;
    }

    context.fillStyle = "#fffdf7";
    context.fillRect(0, 0, size, size);

    for (const stroke of strokes) {
      drawStroke(context, stroke.color, stroke.width, stroke.points);
    }

    if (draftStroke) {
      drawStroke(context, draftStroke.color, draftStroke.width, draftStroke.points);
    }
  }, [draftStroke, size, strokes]);

  const toPoint = (event: PointerEvent<HTMLCanvasElement>): Point => {
    const canvas = canvasRef.current!;
    const bounds = canvas.getBoundingClientRect();
    const scaleX = size / bounds.width;
    const scaleY = size / bounds.height;
    return {
      x: (event.clientX - bounds.left) * scaleX,
      y: (event.clientY - bounds.top) * scaleY
    };
  };

  const finishStroke = (): void => {
    if (!drawingRef.current) {
      return;
    }

    drawingRef.current = false;
    setDraftStroke(null);
    onStrokeEnd();
  };

  return (
    <section className="canvas-shell">
      <div className="canvas-head">
        <div>
          <strong>{canDraw ? "Drawer live" : "Shared sketchbook"}</strong>
        </div>
        <span>{size} x {size}</span>
      </div>
      <canvas
        ref={canvasRef}
        className={`canvas-board ${canDraw ? "is-drawable" : ""}`}
        width={size}
        height={size}
        onPointerDown={(event) => {
          if (!canDraw) {
            return;
          }

          event.currentTarget.setPointerCapture(event.pointerId);
          const point = toPoint(event);
          drawingRef.current = true;
          setDraftStroke({
            color,
            width,
            points: [point]
          });
          onStrokeStart(point);
        }}
        onPointerMove={(event) => {
          if (!canDraw || !drawingRef.current) {
            return;
          }

          const point = toPoint(event);
          setDraftStroke((current) =>
            current
              ? {
                  ...current,
                  points: [...current.points, point]
                }
              : current
          );
          onStrokePoint(point);
        }}
        onPointerUp={finishStroke}
        onPointerLeave={finishStroke}
        onPointerCancel={finishStroke}
      />
    </section>
  );
}

function drawStroke(
  context: CanvasRenderingContext2D,
  color: string,
  width: number,
  points: Point[]
): void {
  if (points.length === 0) {
    return;
  }

  context.strokeStyle = color;
  context.fillStyle = color;
  context.lineWidth = width;
  context.lineCap = "round";
  context.lineJoin = "round";

  if (points.length === 1) {
    const [point] = points;
    context.beginPath();
    context.arc(point.x, point.y, width / 2, 0, Math.PI * 2);
    context.fill();
    return;
  }

  context.beginPath();
  context.moveTo(points[0]!.x, points[0]!.y);
  for (const point of points.slice(1)) {
    context.lineTo(point.x, point.y);
  }
  context.stroke();
}
