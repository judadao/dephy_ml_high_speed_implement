#!/usr/bin/env python3
"""Validate cyclic IO synthetic datasets and write metrics."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from cyclic_io import validate_case_dataset


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--root", default="build_out/cyclic_io/cyclic_io_synthetic_v1")
    parser.add_argument("--result", default="")
    args = parser.parse_args()

    root = Path(args.root)
    results = []
    for case_root in sorted(path for path in root.iterdir() if path.is_dir()):
        results.append(validate_case_dataset(case_root))
    summary = {
        "format": "cyclic_io_validation_result_v1",
        "cases": len(results),
        "results": results,
        "success": all(item["prediction_frame_count"] == 1000 and item["accepted"] for item in results),
    }
    text = json.dumps(summary, indent=2, sort_keys=True) + "\n"
    if args.result:
        Path(args.result).parent.mkdir(parents=True, exist_ok=True)
        Path(args.result).write_text(text)
    else:
        print(text, end="")
    return 0 if summary["success"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
