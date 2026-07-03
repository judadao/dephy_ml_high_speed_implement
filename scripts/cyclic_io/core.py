#!/usr/bin/env python3
"""Core cyclic IO dataset and prediction utilities."""

from __future__ import annotations

import csv
import json
import math
import random
import statistics
import time
from collections import defaultdict
from pathlib import Path
from typing import Any

IO_TYPES = {"DI", "DO", "AI", "AO", "Relay"}
RAW_EVENT_FIELDS = [
    "sample_id",
    "t_ms",
    "cycle_id",
    "phase",
    "io_type",
    "slot",
    "channel",
    "value",
    "status",
    "source",
]


def channel_name(channel: dict[str, Any]) -> str:
    return str(channel.get("name") or f"{str(channel['type']).lower()}_{channel['slot']}_{channel['channel']}")


def load_json(path: str | Path) -> Any:
    return json.loads(Path(path).read_text())


def write_json(path: str | Path, data: Any) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(json.dumps(data, indent=2, sort_keys=True) + "\n")


def load_case_metadata(path: str | Path) -> dict[str, Any]:
    metadata = load_json(path)
    validate_case_metadata(metadata)
    return metadata


def validate_case_metadata(metadata: dict[str, Any]) -> None:
    required = {"case_id", "cycle_period_ms", "prediction_frames", "channels"}
    missing = required - set(metadata)
    if missing:
        raise ValueError(f"metadata missing keys: {sorted(missing)}")
    if int(metadata["prediction_frames"]) <= 0:
        raise ValueError("prediction_frames must be positive")
    seen = set()
    for channel in metadata["channels"]:
        for key in ("type", "slot", "channel"):
            if key not in channel:
                raise ValueError(f"channel missing {key}: {channel}")
        if channel["type"] not in IO_TYPES:
            raise ValueError(f"unknown io type: {channel['type']}")
        name = channel_name(channel)
        if name in seen:
            raise ValueError(f"duplicate channel name: {name}")
        seen.add(name)
        if channel["type"] in {"AI", "AO"} and ("min" not in channel or "max" not in channel):
            raise ValueError(f"analog channel requires min/max: {name}")


def load_snapshots(path: str | Path) -> list[dict[str, Any]]:
    snapshots = load_json(path)
    validate_snapshots(snapshots)
    return snapshots


def validate_snapshots(snapshots: list[dict[str, Any]]) -> None:
    if not snapshots:
        raise ValueError("snapshots must not be empty")
    orders = set()
    for snapshot in snapshots:
        for key in ("snapshot_id", "order", "phase", "io_vector"):
            if key not in snapshot:
                raise ValueError(f"snapshot missing {key}: {snapshot}")
        phase = float(snapshot["phase"])
        if phase < 0 or phase > 1:
            raise ValueError(f"snapshot phase out of range: {snapshot}")
        order = int(snapshot["order"])
        if order in orders:
            raise ValueError(f"duplicate snapshot order: {order}")
        orders.add(order)


def normalize_value(channel: dict[str, Any], value: float) -> float:
    kind = channel["type"]
    if kind in {"DI", "DO", "Relay"}:
        return 1.0 if float(value) >= 0.5 else 0.0
    low = float(channel["min"])
    high = float(channel["max"])
    if high <= low:
        raise ValueError(f"invalid analog range for {channel_name(channel)}")
    return max(0.0, min(1.0, (float(value) - low) / (high - low)))


def denormalize_value(channel: dict[str, Any], value: float) -> float:
    kind = channel["type"]
    if kind in {"DI", "DO", "Relay"}:
        return 1.0 if float(value) >= 0.5 else 0.0
    low = float(channel["min"])
    high = float(channel["max"])
    return low + max(0.0, min(1.0, float(value))) * (high - low)


def parse_raw_events(path: str | Path) -> list[dict[str, Any]]:
    with Path(path).open(newline="") as fp:
        reader = csv.DictReader(fp)
        if reader.fieldnames != RAW_EVENT_FIELDS:
            raise ValueError(f"raw event header mismatch: {reader.fieldnames}")
        return [dict(row) for row in reader]


def write_raw_events(path: str | Path, rows: list[dict[str, Any]]) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with Path(path).open("w", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=RAW_EVENT_FIELDS)
        writer.writeheader()
        writer.writerows(rows)


def build_vector_frames(metadata: dict[str, Any], rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    validate_case_metadata(metadata)
    channel_by_key = {(str(c["type"]), str(c["slot"]), str(c["channel"])): c for c in metadata["channels"]}
    channel_names = [channel_name(c) for c in metadata["channels"]]
    grouped: dict[tuple[str, str, str, str], dict[str, Any]] = {}
    masks: dict[tuple[str, str, str, str], dict[str, int]] = defaultdict(dict)
    for row in rows:
        key = (row["sample_id"], row["t_ms"], row["cycle_id"], row["phase"])
        frame = grouped.setdefault(
            key,
            {
                "sample_id": row["sample_id"],
                "t_ms": float(row["t_ms"]),
                "cycle_id": int(row["cycle_id"]),
                "phase": float(row["phase"]),
            },
        )
        channel = channel_by_key.get((row["io_type"], row["slot"], row["channel"]))
        if not channel:
            raise ValueError(f"unknown channel in raw event: {row}")
        name = channel_name(channel)
        if row["status"] == "ok":
            frame[name] = normalize_value(channel, float(row["value"]))
            masks[key][name] = 1
        else:
            masks[key][name] = 0
    frames = []
    for key, frame in grouped.items():
        for name in channel_names:
            frame.setdefault(name, 0.0)
            frame[f"{name}_mask"] = masks[key].get(name, 0)
        frames.append(frame)
    frames.sort(key=lambda item: (item["cycle_id"], item["phase"], item["t_ms"]))
    return frames


def write_vector_frames(path: str | Path, metadata: dict[str, Any], frames: list[dict[str, Any]]) -> None:
    channel_names = [channel_name(c) for c in metadata["channels"]]
    fields = ["sample_id", "t_ms", "cycle_id", "phase"] + channel_names + [f"{name}_mask" for name in channel_names]
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with Path(path).open("w", newline="") as fp:
        writer = csv.DictWriter(fp, fieldnames=fields)
        writer.writeheader()
        for frame in frames:
            writer.writerow({field: frame.get(field, 0) for field in fields})


def detect_cycle_period_ms(rows: list[dict[str, Any]]) -> float:
    starts: dict[int, float] = {}
    for row in rows:
        cycle_id = int(row["cycle_id"])
        t_ms = float(row["t_ms"])
        starts[cycle_id] = min(t_ms, starts.get(cycle_id, t_ms))
    ordered = [starts[key] for key in sorted(starts)]
    if len(ordered) < 2:
        raise ValueError("need at least two cycles to detect period")
    deltas = [b - a for a, b in zip(ordered, ordered[1:])]
    return statistics.median(deltas)


def smoothstep(value: float) -> float:
    value = max(0.0, min(1.0, value))
    return value * value * (3.0 - 2.0 * value)


def case_metadata(case_id: str) -> dict[str, Any]:
    base = {
        "case_id": case_id,
        "cycle_period_ms": 500,
        "prediction_frames": 1000,
        "channels": [],
        "rules": [
            {
                "rule_id": "emergency_motor_interlock",
                "severity": "hard",
                "if": {"di_1_1": 1},
                "then_not": {"do_2_1": 1},
            }
        ],
    }
    if case_id == "case_a_sine_relay":
        base["channels"] = [
            {"name": "di_1_1", "type": "DI", "slot": 1, "channel": 1},
            {"name": "do_2_1", "type": "DO", "slot": 2, "channel": 1},
            {"name": "ai_3_1", "type": "AI", "slot": 3, "channel": 1, "min": 0, "max": 10},
            {"name": "ao_4_1", "type": "AO", "slot": 4, "channel": 1, "min": 0, "max": 10},
            {"name": "relay_5_1", "type": "Relay", "slot": 5, "channel": 1},
        ]
    elif case_id == "case_b_phase_shifted_io":
        base["channels"] = [
            {"name": "di_1_1", "type": "DI", "slot": 1, "channel": 1},
            {"name": "di_1_2", "type": "DI", "slot": 1, "channel": 2},
            {"name": "ai_3_1", "type": "AI", "slot": 3, "channel": 1, "min": -5, "max": 5},
            {"name": "ai_3_2", "type": "AI", "slot": 3, "channel": 2, "min": -5, "max": 5},
            {"name": "ao_4_1", "type": "AO", "slot": 4, "channel": 1, "min": 0, "max": 20},
            {"name": "relay_5_1", "type": "Relay", "slot": 5, "channel": 1},
        ]
    elif case_id == "case_c_state_machine":
        base["channels"] = [
            {"name": "di_1_1", "type": "DI", "slot": 1, "channel": 1},
            {"name": "di_1_2", "type": "DI", "slot": 1, "channel": 2},
            {"name": "do_2_1", "type": "DO", "slot": 2, "channel": 1},
            {"name": "do_2_2", "type": "DO", "slot": 2, "channel": 2},
            {"name": "ai_3_1", "type": "AI", "slot": 3, "channel": 1, "min": 0, "max": 100},
            {"name": "ao_4_1", "type": "AO", "slot": 4, "channel": 1, "min": 0, "max": 100},
            {"name": "relay_5_1", "type": "Relay", "slot": 5, "channel": 1},
        ]
    else:
        raise ValueError(f"unknown synthetic case: {case_id}")
    validate_case_metadata(base)
    return base


def normalized_pattern(case_id: str, phase: float) -> dict[str, float]:
    phase = phase % 1.0
    if case_id == "case_a_sine_relay":
        return {
            "di_1_1": 1.0 if phase < 0.04 else 0.0,
            "do_2_1": 1.0 if 0.15 <= phase < 0.65 else 0.0,
            "ai_3_1": 0.5 + 0.45 * math.sin(2 * math.pi * phase),
            "ao_4_1": phase,
            "relay_5_1": 1.0 if 0.25 <= phase < 0.75 else 0.0,
        }
    if case_id == "case_b_phase_shifted_io":
        return {
            "di_1_1": 1.0 if phase < 0.05 else 0.0,
            "di_1_2": 1.0 if 0.48 <= phase < 0.55 else 0.0,
            "ai_3_1": 0.5 + 0.4 * math.sin(2 * math.pi * phase),
            "ai_3_2": 0.5 + 0.4 * math.sin(2 * math.pi * (phase + 0.25)),
            "ao_4_1": 0.5 + 0.35 * math.sin(2 * math.pi * (phase + 0.5)),
            "relay_5_1": 1.0 if 0.2 <= phase < 0.7 else 0.0,
        }
    if case_id == "case_c_state_machine":
        if phase < 0.25:
            state = {"di_1_1": 1, "di_1_2": 0, "do_2_1": 0, "do_2_2": 0, "relay_5_1": 0}
            ramp = phase / 0.25 * 0.25
        elif phase < 0.5:
            state = {"di_1_1": 0, "di_1_2": 1, "do_2_1": 1, "do_2_2": 0, "relay_5_1": 1}
            ramp = 0.25 + (phase - 0.25) / 0.25 * 0.35
        elif phase < 0.75:
            state = {"di_1_1": 0, "di_1_2": 0, "do_2_1": 1, "do_2_2": 1, "relay_5_1": 1}
            ramp = 0.6 + (phase - 0.5) / 0.25 * 0.35
        else:
            state = {"di_1_1": 0, "di_1_2": 0, "do_2_1": 0, "do_2_2": 1, "relay_5_1": 0}
            ramp = 0.95 - (phase - 0.75) / 0.25 * 0.95
        state["ai_3_1"] = ramp
        state["ao_4_1"] = smoothstep(ramp)
        return {key: float(value) for key, value in state.items()}
    raise ValueError(f"unknown synthetic case: {case_id}")


def make_snapshots(metadata: dict[str, Any]) -> list[dict[str, Any]]:
    snapshots = []
    for order, phase in enumerate([0.0, 0.25, 0.5, 0.75]):
        snapshots.append(
            {
                "snapshot_id": f"s{order}",
                "order": order,
                "phase": phase,
                "io_vector": normalized_pattern(metadata["case_id"], phase),
                "tolerance": {channel_name(c): 0.02 if c["type"] in {"AI", "AO"} else 0.0 for c in metadata["channels"]},
                "required": True,
            }
        )
    return snapshots


def nearest_snapshot(phase: float, snapshots: list[dict[str, Any]]) -> dict[str, Any]:
    return min(snapshots, key=lambda snapshot: phase_distance(phase, float(snapshot["phase"])))


def training_targets() -> dict[str, Any]:
    return {
        "format": "cyclic_io_training_targets_v1",
        "losses": [
            "phase_loss",
            "snapshot_loss",
            "trajectory_loss",
            "endpoint_loss",
            "smoothness_loss",
            "negative_rejection_loss",
            "confidence_calibration_loss",
        ],
        "negative_reconstruction": "disabled",
    }


def frame_to_raw_events(
    metadata: dict[str, Any],
    sample_id: str,
    cycle_id: int,
    phase: float,
    vector: dict[str, float],
    source: str,
    status: str = "ok",
) -> list[dict[str, Any]]:
    rows = []
    t_ms = cycle_id * float(metadata["cycle_period_ms"]) + phase * float(metadata["cycle_period_ms"])
    for channel in metadata["channels"]:
        name = channel_name(channel)
        rows.append(
            {
                "sample_id": sample_id,
                "t_ms": f"{t_ms:.6f}",
                "cycle_id": str(cycle_id),
                "phase": f"{phase:.6f}",
                "io_type": channel["type"],
                "slot": str(channel["slot"]),
                "channel": str(channel["channel"]),
                "value": f"{denormalize_value(channel, vector.get(name, 0.0)):.9f}",
                "status": status,
                "source": source,
            }
        )
    return rows


def noisy_vector(vector: dict[str, float], amount: float, rng: random.Random) -> dict[str, float]:
    result = {}
    for key, value in vector.items():
        if key.startswith(("ai_", "ao_")):
            result[key] = max(0.0, min(1.0, value + rng.uniform(-amount, amount)))
        else:
            result[key] = value
    return result


def generate_raw_rows(case_id: str, category: str, count: int, seed: int) -> tuple[dict[str, Any], list[dict[str, Any]], list[dict[str, Any]]]:
    metadata = case_metadata(case_id)
    rng = random.Random(seed)
    rows: list[dict[str, Any]] = []
    cycle_count = max(1, count)
    sample_points = 40
    for cycle_id in range(cycle_count):
        for index in range(sample_points):
            phase = index / sample_points
            vector = normalized_pattern(case_id, phase)
            if category in {"positive/noisy", "test/noisy_runtime", "test/few_shot_adaptation"}:
                vector = noisy_vector(vector, 0.025, rng)
            elif category == "positive/variation":
                shifted = (phase + rng.uniform(-0.005, 0.005)) % 1.0
                vector = noisy_vector(normalized_pattern(case_id, shifted), 0.01, rng)
            elif category == "negative/wrong_endpoint" and phase > 0.9:
                vector = noisy_vector(normalized_pattern(case_id, 0.5), 0.02, rng)
            elif category == "negative/over_jerk" and index % 7 == 0:
                vector = {key: (1.0 - value if key.startswith(("ai_", "ao_")) else value) for key, value in vector.items()}
            elif category == "negative/impossible_io":
                vector["di_1_1"] = 1.0
                vector["do_2_1"] = 1.0
            elif category in {"negative/wrong_snapshot_order", "test/negative_rejection"}:
                vector = normalized_pattern(case_id, (1.0 - phase) % 1.0)
            rows.extend(frame_to_raw_events(metadata, f"{case_id}_{category.replace('/', '_')}", cycle_id, phase, vector, category))
    snapshots = make_snapshots(metadata)
    if category == "negative/wrong_snapshot_order":
        snapshots = [snapshots[0], snapshots[2], snapshots[1], snapshots[3]]
    return metadata, snapshots, rows


def generate_case_dataset(root: str | Path, case_id: str, count: int = 3, seed: int = 1001) -> None:
    root_path = Path(root) / "cyclic_io_synthetic_v1" / case_id
    categories = [
        "positive/clean",
        "positive/variation",
        "positive/noisy",
        "negative/wrong_snapshot_order",
        "negative/wrong_endpoint",
        "negative/over_jerk",
        "negative/impossible_io",
        "test/noisy_runtime",
        "test/few_shot_adaptation",
        "test/negative_rejection",
    ]
    metadata = case_metadata(case_id)
    write_json(root_path / "metadata.json", metadata)
    write_json(root_path / "snapshots.json", make_snapshots(metadata))
    write_json(
        root_path / "few_shot_manifest.json",
        {
            "format": "cyclic_io_few_shot_manifest_v1",
            "positive_sources": ["positive/clean", "positive/variation", "positive/noisy"],
            "minimum_cycles": 2,
            "fine_tune_target": "case_cycle_prior",
        },
    )
    write_json(root_path / "training_targets.json", training_targets())
    for offset, category in enumerate(categories):
        _, snapshots, rows = generate_raw_rows(case_id, category, count, seed + offset)
        category_dir = root_path / category
        write_raw_events(category_dir / "raw_events.csv", rows)
        frames = build_vector_frames(metadata, rows)
        write_vector_frames(category_dir / "vector_frames.csv", metadata, frames)
        write_json(category_dir / "snapshots.json", snapshots)


def phase_distance(a: float, b: float) -> float:
    diff = abs((a % 1.0) - (b % 1.0))
    return min(diff, 1.0 - diff)


def estimate_phase(current_vector: dict[str, float], prior_frames: list[dict[str, Any]], channel_names: list[str]) -> dict[str, Any]:
    best = None
    for frame in prior_frames:
        error = math.sqrt(sum((float(current_vector.get(name, 0.0)) - float(frame.get(name, 0.0))) ** 2 for name in channel_names) / max(1, len(channel_names)))
        if best is None or error < best["error"]:
            best = {"phase": float(frame["phase"]), "error": error, "frame": frame}
    return best or {"phase": 0.0, "error": float("inf"), "frame": None}


def predict_transition(
    start: dict[str, float],
    target: dict[str, float],
    start_phase: float,
    target_phase: float,
    metadata: dict[str, Any],
) -> list[dict[str, Any]]:
    frame_count = int(metadata["prediction_frames"])
    if target_phase < start_phase:
        target_phase += 1.0
    phase_span = target_phase - start_phase
    channels = [channel_name(c) for c in metadata["channels"]]
    frames = []
    for index in range(frame_count):
        ratio = index / (frame_count - 1) if frame_count > 1 else 1.0
        eased = smoothstep(ratio)
        phase = (start_phase + ratio * phase_span) % 1.0
        frame = {
            "frame_index": index,
            "phase": phase,
            "t_ms": phase * float(metadata["cycle_period_ms"]),
            "confidence": 1.0,
        }
        for name in channels:
            frame[name] = float(start.get(name, 0.0)) + (float(target.get(name, 0.0)) - float(start.get(name, 0.0))) * eased
        frames.append(frame)
    return frames


def convert_prediction_frames(metadata: dict[str, Any], frames: list[dict[str, Any]]) -> list[dict[str, Any]]:
    records = []
    for frame in frames:
        for channel in metadata["channels"]:
            name = channel_name(channel)
            records.append(
                {
                    "frame_index": frame["frame_index"],
                    "phase": frame["phase"],
                    "t_ms": frame["t_ms"],
                    "io_type": channel["type"],
                    "slot": channel["slot"],
                    "channel": channel["channel"],
                    "name": name,
                    "value": denormalize_value(channel, frame.get(name, 0.0)),
                    "normalized_value": frame.get(name, 0.0),
                    "confidence": frame.get("confidence", 1.0),
                    "status": "predicted",
                }
            )
    return records


def run_rules(metadata: dict[str, Any], vector: dict[str, float]) -> list[dict[str, Any]]:
    violations = []
    for rule in metadata.get("rules", []):
        if all(round(vector.get(name, 0.0)) == expected for name, expected in rule.get("if", {}).items()) and any(
            round(vector.get(name, 0.0)) == forbidden for name, forbidden in rule.get("then_not", {}).items()
        ):
            violations.append({"rule_id": rule["rule_id"], "severity": rule.get("severity", "warning")})
    return violations


def correction_decision(predicted_phase: float, observed_phase: float, threshold: float = 0.08) -> dict[str, Any]:
    error = phase_distance(predicted_phase, observed_phase)
    if error <= threshold:
        action = "smooth_adjust"
    else:
        action = "reanchor_regenerate"
    return {"phase_error": error, "action": action}


def trajectory_metrics(frames: list[dict[str, Any]], metadata: dict[str, Any], target: dict[str, float]) -> dict[str, Any]:
    channels = [channel_name(c) for c in metadata["channels"]]
    final = frames[-1]
    final_error = math.sqrt(sum((float(final.get(name, 0.0)) - float(target.get(name, 0.0))) ** 2 for name in channels) / max(1, len(channels)))
    velocities = []
    for previous, current in zip(frames, frames[1:]):
        velocities.append(max(abs(float(current[name]) - float(previous[name])) for name in channels))
    accelerations = [abs(b - a) for a, b in zip(velocities, velocities[1:])]
    jerks = [abs(b - a) for a, b in zip(accelerations, accelerations[1:])]
    return {
        "prediction_frame_count": len(frames),
        "final_snapshot_error": final_error,
        "max_velocity": max(velocities) if velocities else 0.0,
        "max_acceleration": max(accelerations) if accelerations else 0.0,
        "max_jerk": max(jerks) if jerks else 0.0,
        "accepted": final_error <= 0.001,
    }


def benchmark_prediction(metadata: dict[str, Any], snapshots: list[dict[str, Any]], iterations: int = 20) -> dict[str, Any]:
    start = snapshots[0]
    target = snapshots[1]
    durations = []
    for _ in range(iterations):
        begin = time.perf_counter()
        predict_transition(start["io_vector"], target["io_vector"], float(start["phase"]), float(target["phase"]), metadata)
        durations.append((time.perf_counter() - begin) * 1000.0)
    return {
        "iterations": iterations,
        "inference_latency_p50_ms": statistics.median(durations),
        "inference_latency_p95_ms": sorted(durations)[max(0, int(iterations * 0.95) - 1)],
        "inference_latency_p99_ms": max(durations),
        "prediction_frames": int(metadata["prediction_frames"]),
    }


def validate_case_dataset(case_root: str | Path) -> dict[str, Any]:
    root = Path(case_root)
    metadata = load_case_metadata(root / "metadata.json")
    snapshots = load_snapshots(root / "snapshots.json")
    few_shot = load_json(root / "few_shot_manifest.json")
    target_spec = load_json(root / "training_targets.json")
    categories = list(root.glob("*/*"))
    raw_files = [path / "raw_events.csv" for path in categories if (path / "raw_events.csv").exists()]
    if not raw_files:
        raise ValueError(f"no raw_events.csv files under {root}")
    total_rows = 0
    detected_periods = []
    nearest_snapshot_hits = 0
    for raw_file in raw_files:
        rows = parse_raw_events(raw_file)
        total_rows += len(rows)
        if len({row["cycle_id"] for row in rows}) >= 2:
            detected_periods.append(detect_cycle_period_ms(rows))
        frames = build_vector_frames(metadata, rows)
        if not frames:
            raise ValueError(f"no vector frames from {raw_file}")
        phase = estimate_phase(frames[0], frames, [channel_name(c) for c in metadata["channels"]])["phase"]
        if nearest_snapshot(phase, snapshots):
            nearest_snapshot_hits += 1
    first = snapshots[0]
    second = snapshots[1]
    prediction = predict_transition(first["io_vector"], second["io_vector"], float(first["phase"]), float(second["phase"]), metadata)
    metrics = trajectory_metrics(prediction, metadata, second["io_vector"])
    bench = benchmark_prediction(metadata, snapshots, 5)
    return {
        "case_id": metadata["case_id"],
        "few_shot_format": few_shot["format"],
        "training_target_count": len(target_spec["losses"]),
        "raw_files": len(raw_files),
        "raw_rows": total_rows,
        "detected_cycle_period_ms": statistics.median(detected_periods) if detected_periods else metadata["cycle_period_ms"],
        "nearest_snapshot_checks": nearest_snapshot_hits,
        **metrics,
        **bench,
    }
