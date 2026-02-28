from __future__ import annotations

import json
import math
import urllib.parse
import urllib.request
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

ROOT_DIR = Path(__file__).resolve().parents[2]
WORD_BANK_PATH = ROOT_DIR / "apps" / "server" / "src" / "data" / "word-bank.json"
ALL_CATEGORIES_PATH = ROOT_DIR / "services" / "doodle_classifier" / "data" / "quickdraw_all_categories.txt"
FOCUSED_PROTOTYPE_PATH = ROOT_DIR / "services" / "doodle_classifier" / "data" / "quickdraw_prototypes.json"
FULL_PROTOTYPE_PATH = ROOT_DIR / "services" / "doodle_classifier" / "data" / "quickdraw_prototypes_full.json"
PROTOTYPE_PATH = FOCUSED_PROTOTYPE_PATH
DEFAULT_SAMPLES_PER_LABEL = 32
RASTER_SIZE = 64
RASTER_PADDING = 5
BRUSH_RADIUS = 1.35
DIRECTION_BINS = 16


@dataclass(frozen=True)
class LabelPrototype:
    label: str
    raster: list[float]
    signature: list[float]
    samples: int


def load_word_bank_labels(word_bank_path: Path = WORD_BANK_PATH) -> list[str]:
    with word_bank_path.open("r", encoding="utf-8") as handle:
        word_bank = json.load(handle)

    labels: list[str] = []
    seen: set[str] = set()
    for entry in word_bank:
        label = str(entry["answer"]).strip()
        if label and label not in seen:
            labels.append(label)
            seen.add(label)

    return labels


def load_label_file(labels_path: Path) -> list[str]:
    with labels_path.open("r", encoding="utf-8") as handle:
        return [line.strip() for line in handle if line.strip()]


def load_all_quickdraw_labels(labels_path: Path = ALL_CATEGORIES_PATH) -> list[str]:
    return load_label_file(labels_path)


def ensure_prototypes(
    prototype_path: Path = PROTOTYPE_PATH,
    labels: Iterable[str] | None = None,
    word_bank_path: Path = WORD_BANK_PATH,
    samples_per_label: int = DEFAULT_SAMPLES_PER_LABEL,
) -> Path:
    if prototype_path.exists():
        return prototype_path

    resolved_labels = list(labels) if labels is not None else load_word_bank_labels(word_bank_path)
    build_and_save_prototypes(resolved_labels, prototype_path=prototype_path, samples_per_label=samples_per_label)
    return prototype_path


class QuickDrawPrototypeClassifier:
    def __init__(self, prototype_path: Path = PROTOTYPE_PATH):
        payload = load_prototypes(prototype_path)
        self.prototype_path = prototype_path
        self.metadata = payload["metadata"]
        self.prototypes = payload["prototypes"]

    def predict(self, strokes_payload: object, candidates: object, top_k: int = 5) -> list[dict[str, float | str]]:
        strokes = normalize_payload_strokes(strokes_payload)
        if not strokes:
            return []

        candidate_labels: list[str] = []
        if isinstance(candidates, list):
            for entry in candidates:
                if not isinstance(entry, dict):
                    continue
                label = str(entry.get("label", "")).strip()
                if label and label in self.prototypes:
                    candidate_labels.append(label)
        else:
            candidate_labels = list(self.prototypes.keys())

        # Preserve order while removing duplicates.
        candidate_labels = list(dict.fromkeys(candidate_labels))
        if not candidate_labels:
            raise ValueError("No candidate labels matched the local doodle prototypes")

        raster = rasterize_strokes(strokes)
        signature = build_signature(strokes)

        scored: list[tuple[str, float]] = []
        for label in candidate_labels:
            prototype = self.prototypes[label]
            raster_score = cosine_similarity(raster, prototype.raster)
            signature_score = cosine_similarity(signature, prototype.signature)
            score = (0.82 * raster_score) + (0.18 * signature_score)
            scored.append((label, calibrate_confidence(score)))

        scored.sort(key=lambda item: (-item[1], item[0]))
        return [
            {
                "label": label,
                "confidence": round(score, 4),
            }
            for label, score in scored[: max(1, top_k)]
        ]


def build_and_save_prototypes(
    labels: Iterable[str],
    prototype_path: Path = PROTOTYPE_PATH,
    samples_per_label: int = DEFAULT_SAMPLES_PER_LABEL,
) -> Path:
    prototypes: dict[str, LabelPrototype] = {}
    label_list = list(labels)

    for index, label in enumerate(label_list, start=1):
        print(f"[doodle] building prototype {index}/{len(label_list)} for {label}", flush=True)
        raster_examples: list[list[float]] = []
        signature_examples: list[list[float]] = []

        for drawing in iter_quickdraw_drawings(label):
            strokes = normalize_quickdraw_strokes(drawing)
            if not strokes:
                continue

            raster_examples.append(rasterize_strokes(strokes))
            signature_examples.append(build_signature(strokes))
            if len(raster_examples) >= samples_per_label:
                break

        if not raster_examples:
            raise RuntimeError(f"No recognized Quick, Draw! examples found for {label}")

        prototypes[label] = LabelPrototype(
            label=label,
            raster=average_vectors(raster_examples),
            signature=average_vectors(signature_examples),
            samples=len(raster_examples),
        )

    payload = {
        "metadata": {
            "version": 1,
            "samplesPerLabel": samples_per_label,
            "rasterSize": RASTER_SIZE,
            "rasterPadding": RASTER_PADDING,
            "brushRadius": BRUSH_RADIUS,
            "directionBins": DIRECTION_BINS,
            "labelCount": len(prototypes),
        },
        "labels": {
            label: {
                "samples": prototype.samples,
                "raster": [round(value, 6) for value in prototype.raster],
                "signature": [round(value, 6) for value in prototype.signature],
            }
            for label, prototype in prototypes.items()
        },
    }

    prototype_path.parent.mkdir(parents=True, exist_ok=True)
    with prototype_path.open("w", encoding="utf-8") as handle:
        json.dump(payload, handle, separators=(",", ":"))
        handle.write("\n")

    print(f"[doodle] wrote prototypes to {prototype_path}", flush=True)
    return prototype_path


def load_prototypes(prototype_path: Path) -> dict[str, dict[str, object] | dict[str, LabelPrototype]]:
    with prototype_path.open("r", encoding="utf-8") as handle:
        payload = json.load(handle)

    prototypes = {
        label: LabelPrototype(
            label=label,
            raster=[float(value) for value in entry["raster"]],
            signature=[float(value) for value in entry["signature"]],
            samples=int(entry["samples"]),
        )
        for label, entry in payload["labels"].items()
    }

    return {
        "metadata": payload.get("metadata", {}),
        "prototypes": prototypes,
    }


def iter_quickdraw_drawings(label: str) -> Iterable[object]:
    url = (
        "https://storage.googleapis.com/quickdraw_dataset/full/simplified/"
        f"{urllib.parse.quote(label, safe='')}.ndjson"
    )
    with urllib.request.urlopen(url, timeout=30) as response:
        for raw_line in response:
            if not raw_line.strip():
                continue

            entry = json.loads(raw_line)
            if entry.get("recognized"):
                yield entry.get("drawing", [])


def normalize_quickdraw_strokes(drawing: object) -> list[list[tuple[float, float]]]:
    strokes: list[list[tuple[float, float]]] = []
    if not isinstance(drawing, list):
        return strokes

    for stroke in drawing:
        if not isinstance(stroke, list) or len(stroke) != 2:
            continue

        x_coords, y_coords = stroke
        if not isinstance(x_coords, list) or not isinstance(y_coords, list):
            continue

        points = []
        for x, y in zip(x_coords, y_coords):
            points.append((float(x), float(y)))

        if points:
            strokes.append(points)

    return strokes


def normalize_payload_strokes(strokes_payload: object) -> list[list[tuple[float, float]]]:
    strokes: list[list[tuple[float, float]]] = []
    if not isinstance(strokes_payload, list):
        return strokes

    for stroke in strokes_payload:
        if not isinstance(stroke, dict):
            continue

        points_payload = stroke.get("points", [])
        if not isinstance(points_payload, list):
            continue

        points = []
        for point in points_payload:
            if not isinstance(point, dict):
                continue

            x = point.get("x")
            y = point.get("y")
            if isinstance(x, (int, float)) and isinstance(y, (int, float)):
                points.append((float(x), float(y)))

        if points:
            strokes.append(points)

    return strokes


def rasterize_strokes(strokes: list[list[tuple[float, float]]]) -> list[float]:
    transformed, _, _, _ = normalize_to_canvas(strokes)
    pixels = [0.0] * (RASTER_SIZE * RASTER_SIZE)

    for stroke in transformed:
        if len(stroke) == 1:
            stamp_disk(pixels, stroke[0][0], stroke[0][1], BRUSH_RADIUS)
            continue

        for start, end in zip(stroke, stroke[1:]):
            draw_segment(pixels, start, end, BRUSH_RADIUS)

    return pixels


def build_signature(strokes: list[list[tuple[float, float]]]) -> list[float]:
    _, width, height, total_points = normalize_to_canvas(strokes)
    histogram = [0.0] * DIRECTION_BINS
    total_length = 0.0
    segment_count = 0

    for stroke in strokes:
        for start, end in zip(stroke, stroke[1:]):
            dx = end[0] - start[0]
            dy = end[1] - start[1]
            length = math.hypot(dx, dy)
            if length <= 1e-6:
                continue

            angle = math.atan2(dy, dx)
            bucket = int(((angle + math.pi) / (2 * math.pi)) * DIRECTION_BINS) % DIRECTION_BINS
            histogram[bucket] += length
            total_length += length
            segment_count += 1

    histogram_total = sum(histogram) or 1.0
    histogram = [value / histogram_total for value in histogram]

    aspect_ratio = (width + 1.0) / (height + 1.0)
    aspect_feature = 0.5 + (math.atan(math.log(aspect_ratio)) / math.pi)
    density_feature = clamp(total_length / max(16.0, width + height + 1.0))
    stroke_feature = clamp(len(strokes) / 12.0)
    segment_feature = clamp(segment_count / 96.0)
    point_feature = clamp(total_points / 160.0)

    return histogram + [
        round(aspect_feature, 6),
        round(density_feature, 6),
        round(stroke_feature, 6),
        round(segment_feature, 6),
        round(point_feature, 6),
    ]


def normalize_to_canvas(
    strokes: list[list[tuple[float, float]]],
) -> tuple[list[list[tuple[float, float]]], float, float, int]:
    all_points = [point for stroke in strokes for point in stroke]
    if not all_points:
        return [], 1.0, 1.0, 0

    min_x = min(point[0] for point in all_points)
    max_x = max(point[0] for point in all_points)
    min_y = min(point[1] for point in all_points)
    max_y = max(point[1] for point in all_points)
    width = max(1.0, max_x - min_x)
    height = max(1.0, max_y - min_y)

    drawable = max(1.0, RASTER_SIZE - (RASTER_PADDING * 2))
    scale = drawable / max(width, height)
    scaled_width = width * scale
    scaled_height = height * scale
    offset_x = ((RASTER_SIZE - scaled_width) / 2.0) - (min_x * scale)
    offset_y = ((RASTER_SIZE - scaled_height) / 2.0) - (min_y * scale)

    normalized = [
        [(point[0] * scale + offset_x, point[1] * scale + offset_y) for point in stroke]
        for stroke in strokes
    ]
    return normalized, width, height, len(all_points)


def draw_segment(
    pixels: list[float],
    start: tuple[float, float],
    end: tuple[float, float],
    radius: float,
) -> None:
    dx = end[0] - start[0]
    dy = end[1] - start[1]
    steps = max(1, int(max(abs(dx), abs(dy)) * 2))

    for step in range(steps + 1):
        t = step / steps
        x = start[0] + (dx * t)
        y = start[1] + (dy * t)
        stamp_disk(pixels, x, y, radius)


def stamp_disk(pixels: list[float], x: float, y: float, radius: float) -> None:
    min_x = max(0, int(math.floor(x - radius)))
    max_x = min(RASTER_SIZE - 1, int(math.ceil(x + radius)))
    min_y = max(0, int(math.floor(y - radius)))
    max_y = min(RASTER_SIZE - 1, int(math.ceil(y + radius)))
    radius_sq = radius * radius

    for py in range(min_y, max_y + 1):
        for px in range(min_x, max_x + 1):
            distance_sq = ((px + 0.5) - x) ** 2 + ((py + 0.5) - y) ** 2
            if distance_sq <= radius_sq:
                pixels[(py * RASTER_SIZE) + px] = 1.0


def average_vectors(vectors: list[list[float]]) -> list[float]:
    if not vectors:
        raise ValueError("Cannot average an empty vector set")

    dimension = len(vectors[0])
    totals = [0.0] * dimension

    for vector in vectors:
        for index, value in enumerate(vector):
            totals[index] += value

    count = float(len(vectors))
    return [value / count for value in totals]


def cosine_similarity(left: list[float], right: list[float]) -> float:
    numerator = sum(a * b for a, b in zip(left, right))
    left_norm = math.sqrt(sum(value * value for value in left))
    right_norm = math.sqrt(sum(value * value for value in right))
    if left_norm <= 1e-12 or right_norm <= 1e-12:
        return 0.0

    return numerator / (left_norm * right_norm)


def clamp(value: float, minimum: float = 0.0, maximum: float = 1.0) -> float:
    return max(minimum, min(maximum, value))


def calibrate_confidence(score: float) -> float:
    return clamp(clamp(score) ** 0.8)
