#!/usr/bin/env python3
"""Convert runtime IO observations into append-friendly runtime anchors."""

from __future__ import annotations

import argparse
import csv
import json
from pathlib import Path


FIELDS = ["x", "y", "z", "yaw", "pitch", "roll", "grip"]


def row_to_anchor(row: dict, index: int) -> dict:
    anchor_id = row.get("io_id") or f"runtime_anchor_{index:04d}"
    source = row.get("source") or "runtime_io"
    return {
        "format": "dephy_runtime_anchor_v1",
        "anchor_id": anchor_id,
        "t_ms": int(float(row["t_ms"])),
        "source": source,
        "io": {
            "slot": int(float(row.get("slot", 1))),
            "type": row.get("io_type", "ai"),
            "channel": int(float(row.get("channel", 1))),
            "value": float(row.get("value", 0)),
        },
        "observed_pose": {field: float(row[field]) for field in FIELDS},
        "confidence": float(row.get("confidence", 0.85)),
        "jitter": float(row.get("jitter", 0.0)),
        "raw": dict(row),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--runtime-io", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--append", action="store_true")
    args = parser.parse_args()

    with Path(args.runtime_io).open(newline="") as fp:
        rows = list(csv.DictReader(fp))

    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    mode = "a" if args.append else "w"
    with out_path.open(mode) as fp:
        for index, row in enumerate(rows):
            fp.write(json.dumps(row_to_anchor(row, index), separators=(",", ":"), sort_keys=True) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
