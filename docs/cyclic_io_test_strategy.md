# Cyclic IO Test Strategy

This document defines the testing targets for the cyclic IO prediction engine.
It separates repository/system tests from model training targets so the project
can validate both the pipeline and the learned behavior.

## Test Layers

Repository tests validate the end-to-end system contract:

```txt
positive sample
  -> snapshot labels
  -> runtime noisy IO
  -> phase estimate
  -> 1000-frame prediction
  -> result metrics
```

Model training targets validate whether the model learned cyclic phase,
snapshot transitions, convergence, and smooth high-speed trajectory generation.

## Repository Test Goals

The first test suite should use synthetic cyclic IO because synthetic data gives
known ground truth for phase, snapshots, and trajectory.

Required repository-level checks:

```txt
schema test:
  DI / DO / AI / AO / Relay rows can be parsed, vectorized, imported, and exported.

snapshot test:
  snapshots can be recorded, imported, exported, and mapped back to IO vectors.

phase test:
  phase estimation error stays below the configured threshold.

prediction shape test:
  each cycle or snapshot transition produces exactly 1000 prediction frames.

time grid test:
  prediction dt equals cycle_period_ms / 1000.

endpoint test:
  the final prediction frame matches the target snapshot within tolerance.

noise convergence test:
  noisy runtime IO still converges to the correct target snapshot.

latency test:
  inference finishes within the runtime budget.

e2e test:
  linux_io_device_simul -> runtime IO -> implement -> prediction result.
```

## Synthetic Benchmark Set

The first benchmark suite should be named `cyclic_io_synthetic_v1`.

It should include at least these cases:

```txt
case A:
  simple sine AI + relay on/off.

case B:
  multi-channel phase-shifted AI/AO + DI trigger.

case C:
  DI/DO/Relay discrete state machine + analog ramp.
```

Each case should contain:

```txt
positive_sample.csv
snapshots.json
runtime_noisy_io.csv
expected_phase.csv
expected_prediction.csv
```

The benchmark should verify that few positive samples are enough to fine-tune a
cycle prior, and that noisy test IO still converges to the correct snapshot
sequence.

## Model Training Targets

The model should not only predict the next raw IO value. It should learn:

```txt
1. current phase in the cycle
2. current/target snapshot identity
3. 1000-frame trajectory between snapshots
4. correction behavior under noisy runtime IO
```

Training losses should include:

```txt
phase_loss:
  predicted phase should match ground-truth phase.

snapshot_loss:
  predicted current and target snapshots should be correct.

trajectory_loss:
  generated 1000-frame trajectory should reconstruct the positive sample.

endpoint_loss:
  final frame must match the target snapshot.

smoothness_loss:
  velocity, acceleration, and jerk should stay within limits.

noise_robust_loss:
  noisy input should still generate a trajectory close to the correct target.
```

## Initial Pass/Fail Metrics

Suggested initial thresholds:

```txt
snapshot_match_rate >= 99%
final_snapshot_error <= configured tolerance
phase_error_mean <= 0.02
phase_error_p95 <= 0.05
trajectory_mse <= configured threshold
max_jerk <= configured threshold
inference_latency_p95 <= 10ms
preferred_inference_latency_p95 <= 5ms
prediction_frame_count == 1000
dt_error == 0
```

The most important release gates are:

```txt
final_snapshot_error
snapshot_match_rate
inference_latency_p95
```

## Practical Rule

Repository tests prove the pipeline is reproducible, measurable, and fast.
Model tests prove the model learned phase, snapshot transition, smooth
trajectory, and noisy runtime convergence.
