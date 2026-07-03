# Cyclic IO Dataset Design

This document defines the first dataset strategy for the cyclic IO prediction
engine. Dataset design must teach the model what a valid periodic IO process
looks like, what invalid-but-confusing behavior looks like, and how noisy
runtime IO should converge back to the correct snapshot sequence.

## Dataset Goals

The dataset should teach three behaviors:

```txt
1. normal cyclic IO phase and snapshot transitions
2. invalid transitions or unsafe trajectories that must not be accepted
3. noisy runtime IO convergence back to the correct snapshot
```

Datasets are split into:

```txt
positive/
negative/
test/
```

Positive data defines valid behavior. Negative data defines invalid or unsafe
behavior. Test data verifies unseen cycles, runtime noise, few-shot adaptation,
and rejection of invalid inputs.

## Positive Dataset

Positive samples represent correct cyclic IO behavior. They should not be only
a single perfect replay. They should cover the accepted normal range of a
process.

Positive data should include:

```txt
normal cycle IO samples
correct snapshot sequence
ground-truth trajectory between snapshots
different cycle periods
small runtime noise
accepted device variation
```

Recommended first categories:

```txt
positive_clean:
  Perfect cycle without noise. Used to learn the base cyclic shape.

positive_variation:
  Same logical process with different cycle periods, amplitudes, or minor
  timing differences. Phase normalization should make them equivalent.

positive_noisy:
  Correct process with realistic sensor/IO noise. The final snapshot sequence
  is still correct.
```

The model should learn:

```txt
phase -> expected IO state
phase -> nearest/current snapshot
phase -> next target snapshot
snapshot pair -> 1000-frame trajectory
```

## Negative Dataset

Negative samples are not just random garbage. They should represent behavior
that may look plausible but must not be accepted as a valid cyclic trajectory.

Recommended first categories:

```txt
wrong_snapshot_order:
  Snapshot sequence is invalid, skipped, reversed, or stuck.

wrong_endpoint:
  The trajectory may be smooth, but the final frame does not reach the target
  snapshot.

over_jerk:
  The final snapshot may be correct, but intermediate IO changes are too sharp,
  unstable, or unsafe.

wrong_phase:
  IO values are plausible, but assigned to the wrong phase or wrong target
  snapshot.

impossible_io:
  IO combinations violate device/process rules.

corrupted_io:
  Channel swap, missing channel, stale value, spike, dropout, duplicated frame,
  or timestamp jitter beyond the accepted range.
```

Examples of `impossible_io`:

```txt
DI emergency_stop = 1 while DO motor_run = 1
relay_closed = 0 while AO torque_command is high
DI home = 1 while AI position is far from home
```

The first implementation should focus on these four negative groups:

```txt
wrong_snapshot_order
wrong_endpoint
over_jerk
impossible_io
```

Do not overuse fully random corrupted data in the first version. Too much random
garbage can make the model learn only trivial rejection instead of subtle
industrial process mistakes.

## Test Dataset

Test data must be different from training data. It should simulate real runtime
conditions and verify generalization.

Recommended first categories:

```txt
test_clean_unseen:
  Valid cycle with seed, cycle period, amplitude, or timing not seen in
  training.

test_noisy_runtime:
  Valid process with realistic noise, timestamp jitter, and minor value drift.

test_few_shot_adaptation:
  Only a small number of positive samples are provided before fine-tune.

test_negative_rejection:
  Invalid snapshot orders, impossible IO states, and unsafe trajectories should
  not be accepted as valid predictions.
```

## Suggested Folder Layout

```txt
datasets/
  cyclic_io_synthetic_v1/
    positive/
      clean/
      variation/
      noisy/
    negative/
      wrong_snapshot_order/
      wrong_endpoint/
      over_jerk/
      wrong_phase/
      impossible_io/
      corrupted_io/
    test/
      clean_unseen/
      noisy_runtime/
      few_shot_adaptation/
      negative_rejection/
    metadata.json
    snapshots.json
```

## First Dataset Scope

The first dataset should stay small and clear:

```txt
positive:
  clean
  variation
  noisy

negative:
  wrong_snapshot_order
  wrong_endpoint
  over_jerk
  impossible_io

test:
  noisy_runtime
  few_shot_adaptation
  negative_rejection
```

## Design Rules

Positive data means accepted normal behavior, not necessarily noise-free data.

Negative data means invalid or unsafe behavior that may still look plausible,
not only random bad rows.

The key distinction the model must learn is:

```txt
normal variation should converge
invalid or unsafe variation should be rejected
```
