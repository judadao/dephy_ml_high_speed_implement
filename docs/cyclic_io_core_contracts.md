# Cyclic IO Core Contracts

This document records the accepted discussion defaults for the remaining core
cyclic IO topics. User-operation and UI topics remain deferred.

## 1. Synthetic Dataset Generation Rules

The first synthetic benchmark is `cyclic_io_synthetic_v1`.

Initial cases:

```txt
case_a_sine_relay:
  AI sine wave + relay on/off.

case_b_phase_shifted_io:
  multiple AI/AO channels with phase shift + DI trigger.

case_c_state_machine:
  DI/DO/Relay discrete state machine + analog ramp.
```

Each case should generate:

```txt
positive/clean
positive/variation
positive/noisy
negative/wrong_snapshot_order
negative/wrong_endpoint
negative/over_jerk
negative/impossible_io
test/noisy_runtime
test/few_shot_adaptation
test/negative_rejection
```

## 2. Model Input / Output Contract

Model input should use normalized fixed-width vectors:

```txt
current normalized IO vector
previous estimated phase
normalized cycle_period_ms
current snapshot one-hot
target snapshot one-hot
confidence or mask vector
```

Model output should be:

```txt
1000 x complete normalized IO vector
1000 x confidence / uncertainty
predicted phase grid
target snapshot id
```

Analog output remains normalized. Repository converter code denormalizes and
maps the complete IO vector back to case-specific slot/channel/value records.

## 3. Training Objective

Training should use separate objectives:

```txt
phase_loss
snapshot_loss
trajectory_loss
endpoint_loss
smoothness_loss
negative_rejection_loss
confidence_calibration_loss
```

Positive samples train trajectory, endpoint, phase, snapshot, and smoothness.
Negative samples primarily train rejection/classification. The model should not
be forced to reconstruct invalid negative trajectories as if they were valid.

## 4. Runtime Correction Behavior

Runtime maintains a prediction buffer.

When new IO arrives:

```txt
estimate phase
compare with active prediction phase
if error is small:
  smoothly adjust future frames
if error is large:
  re-anchor and regenerate future frames
if IO is impossible:
  reject or fallback
```

Past frames are not rewritten. Future frames can be replaced. Every correction
should emit metadata so downstream tools can distinguish normal prediction from
re-anchored prediction.

## 5. Fail-Safe / Rule Engine

Deterministic rules should exist beside the model. Impossible IO should not rely
only on ML.

Rule severity:

```txt
hard violation:
  reject immediately. Example: emergency stop active while motor_run is active.

soft violation:
  lower confidence and request re-anchor.

warning:
  record metadata but do not block prediction.
```

## 6. Performance Benchmark

Benchmark metrics:

```txt
inference_latency_p50
inference_latency_p95
inference_latency_p99
1000_frame_generation_ms
throughput_cycles_per_sec
memory_peak
model_size
```

Initial gates:

```txt
inference_latency_p95 < 10ms
preferred_inference_latency_p95 < 5ms
prediction_frame_count == 1000
dt_error == 0
```

Benchmark reports must record CPU/environment, runtime path, and batch size.

## 7. Snapshot / Key-State Format

Snapshot format is a data contract, not a user-interface workflow.

Initial shape:

```json
{
  "snapshot_id": "s0",
  "order": 0,
  "phase": 0.0,
  "io_vector": {},
  "tolerance": {},
  "required": true
}
```

Snapshot sequence is used by phase estimation, target selection, endpoint
validation, and negative order validation.

## 8. Case Metadata / IO Map

Every dataset/test case should include metadata that bridges normalized model
vectors and concrete IO points:

```json
{
  "cycle_period_ms": 500,
  "prediction_frames": 1000,
  "channels": [
    {
      "name": "ai_1_1",
      "type": "AI",
      "slot": 1,
      "channel": 1,
      "min": 0,
      "max": 10
    },
    {
      "name": "relay_5_1",
      "type": "Relay",
      "slot": 5,
      "channel": 1
    }
  ],
  "rules": []
}
```

## 9. Result / Metrics Format

Every run should emit a structured result:

```json
{
  "snapshot_match_rate": 0.99,
  "phase_error_mean": 0.01,
  "final_snapshot_error": 0.001,
  "max_jerk": 0.03,
  "inference_latency_p95_ms": 4.8,
  "accepted": true
}
```

## 10. File / Folder Layout

Dataset layout:

```txt
datasets/
  cyclic_io_synthetic_v1/
    case_a_sine_relay/
      metadata.json
      snapshots.json
      positive/
      negative/
      test/
```

Core implementation layout direction:

```txt
scripts/ or src/
  cyclic_io/
    schema
    generator
    vectorizer
    trainer
    predictor
    validator
```

The exact language split is still undecided, but the module boundaries should
remain close to this list.
