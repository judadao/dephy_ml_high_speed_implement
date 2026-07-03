#!/usr/bin/env python3
"""Convert linux_io_device_simul slot stream output into cyclic IO dataset rows."""

from __future__ import annotations

import argparse
import json
from pathlib import Path

from cyclic_io.core import (
    build_vector_frames,
    channel_name,
    convert_prediction_frames,
    predict_transition,
    trajectory_metrics,
    write_json,
    write_raw_events,
    write_vector_frames,
)


def parse_slot_line(line: str) -> dict:
    _, payload = line.split(" ", 1)
    return json.loads(payload)


def io_type(value: str) -> str:
    upper = value.upper()
    return "Relay" if upper == "RELAY" else upper


def metadata_from_events(events: list[dict]) -> dict:
    channels = []
    seen = set()
    analog_ranges = {}
    for event in events:
        kind = io_type(event["type"])
        key = (kind, int(event["slot"]), int(event["channel"]))
        if kind in {"AI", "AO"}:
            analog_ranges.setdefault(key, [float(event["value"]), float(event["value"])])
            analog_ranges[key][0] = min(analog_ranges[key][0], float(event["value"]))
            analog_ranges[key][1] = max(analog_ranges[key][1], float(event["value"]))
        if key in seen:
            continue
        seen.add(key)
        channel = {"type": kind, "slot": key[1], "channel": key[2]}
        channel["name"] = channel_name(channel)
        channels.append(channel)
    for channel in channels:
        key = (channel["type"], channel["slot"], channel["channel"])
        if channel["type"] in {"AI", "AO"}:
            low, high = analog_ranges[key]
            channel["min"] = min(0.0, low)
            channel["max"] = max(100.0, high, low + 1.0)
    return {
        "case_id": "linux_io_device_slot_stream",
        "cycle_period_ms": 1,
        "prediction_frames": 1000,
        "channels": sorted(channels, key=lambda item: (item["type"], item["slot"], item["channel"])),
        "rules": [],
    }


def raw_rows_from_events(events: list[dict], metadata: dict) -> list[dict]:
    loops = sorted({int(event.get("loop", 0)) for event in events})
    loop_start = {}
    loop_period = {}
    for loop in loops:
        loop_events = [event for event in events if int(event.get("loop", 0)) == loop]
        start = min(float(event["t_ms"]) for event in loop_events)
        end = max(float(event["t_ms"]) for event in loop_events)
        loop_start[loop] = start
        loop_period[loop] = max(1.0, end - start + 1.0)
    metadata["cycle_period_ms"] = max(loop_period.values()) if loop_period else 1.0
    rows = []
    for event in events:
        loop = int(event.get("loop", 0))
        phase = (float(event["t_ms"]) - loop_start[loop]) / loop_period[loop]
        rows.append(
            {
                "sample_id": "linux_io_device_slot_stream",
                "t_ms": f"{float(event['t_ms']):.6f}",
                "cycle_id": str(loop),
                "phase": f"{phase:.6f}",
                "io_type": io_type(event["type"]),
                "slot": str(event["slot"]),
                "channel": str(event["channel"]),
                "value": str(event["value"]),
                "status": "ok",
                "source": "linux_io_device_simul",
            }
        )
    return rows


def snapshots_from_frames(frames: list[dict], metadata: dict) -> list[dict]:
    if len(frames) < 2:
        raise ValueError("need at least two vector frames for snapshots")
    channels = [channel_name(channel) for channel in metadata["channels"]]
    candidates = [frames[0], frames[len(frames) // 3], frames[(len(frames) * 2) // 3], frames[-1]]
    snapshots = []
    for order, frame in enumerate(candidates):
        snapshots.append(
            {
                "snapshot_id": f"slot_s{order}",
                "order": order,
                "phase": float(frame["phase"]),
                "io_vector": {name: float(frame.get(name, 0.0)) for name in channels},
                "tolerance": {name: 0.02 for name in channels},
                "required": True,
            }
        )
    return snapshots


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--stream", required=True)
    parser.add_argument("--out", required=True)
    args = parser.parse_args()

    events = [parse_slot_line(line) for line in Path(args.stream).read_text().splitlines() if line.strip()]
    metadata = metadata_from_events(events)
    rows = raw_rows_from_events(events, metadata)
    frames = build_vector_frames(metadata, rows)
    snapshots = snapshots_from_frames(frames, metadata)
    prediction = predict_transition(
        snapshots[0]["io_vector"],
        snapshots[1]["io_vector"],
        float(snapshots[0]["phase"]),
        float(snapshots[1]["phase"]),
        metadata,
    )
    metrics = trajectory_metrics(prediction, metadata, snapshots[1]["io_vector"])

    out = Path(args.out)
    write_json(out / "metadata.json", metadata)
    write_json(out / "snapshots.json", snapshots)
    write_raw_events(out / "positive" / "clean" / "raw_events.csv", rows)
    write_vector_frames(out / "positive" / "clean" / "vector_frames.csv", metadata, frames)
    write_json(out / "prediction_records.json", convert_prediction_frames(metadata, prediction)[:20])
    write_json(
        out / "result.json",
        {
            "format": "cyclic_io_slot_stream_result_v1",
            "events": len(events),
            "vector_frames": len(frames),
            "prediction_frames": len(prediction),
            **metrics,
            "success": len(prediction) == 1000 and metrics["accepted"],
        },
    )
    return 0 if len(prediction) == 1000 and metrics["accepted"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
