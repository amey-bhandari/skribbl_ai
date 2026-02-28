from __future__ import annotations

import json
import os
from http import HTTPStatus
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from quickdraw_classifier import (
    DEFAULT_SAMPLES_PER_LABEL,
    PROTOTYPE_PATH,
    QuickDrawPrototypeClassifier,
    WORD_BANK_PATH,
    ensure_prototypes,
)

HOST = os.environ.get("DOODLE_SERVICE_HOST", "127.0.0.1")
PORT = int(os.environ.get("DOODLE_SERVICE_PORT", "8008"))
SAMPLES_PER_LABEL = int(os.environ.get("DOODLE_SAMPLES_PER_LABEL", str(DEFAULT_SAMPLES_PER_LABEL)))

ensure_prototypes(PROTOTYPE_PATH, WORD_BANK_PATH, samples_per_label=SAMPLES_PER_LABEL)
CLASSIFIER = QuickDrawPrototypeClassifier(PROTOTYPE_PATH)


class DoodleHandler(BaseHTTPRequestHandler):
    server_version = "quickdraw-prototype/1.0"

    def do_GET(self) -> None:
        if self.path != "/health":
            self.respond(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        self.respond(
            HTTPStatus.OK,
            {
                "status": "ok",
                "backend": "quickdraw_prototype_v1",
                "prototypePath": str(CLASSIFIER.prototype_path),
                "labelCount": len(CLASSIFIER.prototypes),
                "metadata": CLASSIFIER.metadata,
            },
        )

    def do_POST(self) -> None:
        if self.path != "/predict":
            self.respond(HTTPStatus.NOT_FOUND, {"error": "Not found"})
            return

        try:
            content_length = int(self.headers.get("Content-Length", "0"))
        except ValueError:
            self.respond(HTTPStatus.BAD_REQUEST, {"error": "Invalid Content-Length header"})
            return

        try:
            payload = json.loads(self.rfile.read(content_length) or b"{}")
        except json.JSONDecodeError:
            self.respond(HTTPStatus.BAD_REQUEST, {"error": "Invalid JSON body"})
            return

        top_k = payload.get("topK", 5)
        try:
            labels = CLASSIFIER.predict(payload.get("strokes"), payload.get("candidates"), int(top_k))
        except ValueError as error:
            self.respond(HTTPStatus.UNPROCESSABLE_ENTITY, {"error": str(error)})
            return
        except Exception as error:  # pragma: no cover - defensive service boundary
            self.respond(HTTPStatus.INTERNAL_SERVER_ERROR, {"error": str(error)})
            return

        self.respond(
            HTTPStatus.OK,
            {
                "backend": "quickdraw_prototype_v1",
                "labels": labels,
            },
        )

    def log_message(self, format: str, *args: object) -> None:
        message = format % args
        print(f"[doodle] {self.address_string()} {message}", flush=True)

    def respond(self, status: HTTPStatus, payload: dict[str, object]) -> None:
        body = json.dumps(payload).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


if __name__ == "__main__":
    server = ThreadingHTTPServer((HOST, PORT), DoodleHandler)
    print(f"[doodle] listening on http://{HOST}:{PORT}", flush=True)
    server.serve_forever()
