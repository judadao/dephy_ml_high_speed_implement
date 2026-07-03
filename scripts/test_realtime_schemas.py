#!/usr/bin/env python3
"""Smoke-check realtime schemas against generated watcher artifacts."""

from __future__ import annotations

import json
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def require_keys(obj: dict, keys: list[str], name: str) -> None:
    missing = [key for key in keys if key not in obj]
    if missing:
        raise AssertionError(f"{name} missing keys: {missing}")


def main() -> int:
    for schema in ("prediction_segment.schema.json", "realtime_result.schema.json", "bootstrap_prior_sample.schema.json", "runtime_anchor.schema.json"):
        json.loads((ROOT / "schemas" / schema).read_text())

    outdir = ROOT / "build_out" / "hand_realtime"
    segment = json.loads(next(line for line in (outdir / "prediction_segments.jsonl").read_text().splitlines() if line.strip()))
    result = json.loads((outdir / "result.json").read_text())
    sample = json.loads(next(line for line in (outdir / "bootstrap_samples.jsonl").read_text().splitlines() if line.strip()))
    anchor_path = outdir / "runtime_anchors.jsonl"
    anchor = json.loads(next(line for line in anchor_path.read_text().splitlines() if line.strip())) if anchor_path.exists() else None

    require_keys(segment, ["format", "segment_index", "segment_type", "from", "to", "from_anchor", "to_anchor", "frames_between_keyframes", "confidence", "frames"], "segment")
    require_keys(segment["frames"][0], ["csvLine", "frame_t_ms", "target_frame", "palm_x", "palm_y", "palm_z", "yaw", "pitch", "roll", "grip"], "segment frame")
    require_keys(result, ["format", "mode", "state", "keyframes_seen", "anchors_seen", "segments_written", "bootstrap_segments", "confirmed_segments", "correction_segments", "prediction_frames", "success"], "result")
    require_keys(sample, ["format", "label", "start", "predicted_target", "actual_target", "sample_ms", "metrics"], "bootstrap sample")
    if anchor:
        require_keys(anchor, ["format", "anchor_id", "t_ms", "source", "observed_pose", "confidence"], "runtime anchor")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
