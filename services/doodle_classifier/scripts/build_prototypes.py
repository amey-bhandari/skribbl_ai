from __future__ import annotations

import argparse
import sys
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
SERVICE_DIR = SCRIPT_DIR.parent
if str(SERVICE_DIR) not in sys.path:
    sys.path.insert(0, str(SERVICE_DIR))

from quickdraw_classifier import (  # noqa: E402
    DEFAULT_SAMPLES_PER_LABEL,
    PROTOTYPE_PATH,
    WORD_BANK_PATH,
    build_and_save_prototypes,
    load_word_bank_labels,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build local doodle prototypes from Quick, Draw! data")
    parser.add_argument(
        "--samples-per-label",
        type=int,
        default=DEFAULT_SAMPLES_PER_LABEL,
        help="Number of recognized Quick, Draw! samples to average for each label",
    )
    parser.add_argument(
        "--prototype-path",
        type=Path,
        default=PROTOTYPE_PATH,
        help="Output path for the generated prototype JSON",
    )
    parser.add_argument(
        "--word-bank-path",
        type=Path,
        default=WORD_BANK_PATH,
        help="Path to the server word bank JSON file",
    )
    args = parser.parse_args()

    labels = load_word_bank_labels(args.word_bank_path)
    build_and_save_prototypes(labels, prototype_path=args.prototype_path, samples_per_label=args.samples_per_label)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
