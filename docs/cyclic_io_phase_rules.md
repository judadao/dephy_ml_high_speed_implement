# Cyclic IO Phase Rules

This draft defines the first cycle boundary and phase rules for the cyclic IO
prediction engine.

## Core Rule

Training phase is supervised. Runtime phase is estimated. Prediction phase is
normalized.

Cycle transition should be detected by explicit cycle metadata first and phase
wrap second.

## Training Phase

Training datasets should provide ground-truth cycle timing:

```txt
cycle_start_t_ms
cycle_period_ms
```

Each sample phase is computed as:

```txt
phase = (t_ms - cycle_start_t_ms) / cycle_period_ms
```

Phase is normalized to:

```txt
0.0 <= phase <= 1.0
```

## Snapshot Phase

Snapshots are key states on the normalized cycle:

```txt
snapshot_0 -> phase 0.00
snapshot_1 -> phase 0.25
snapshot_2 -> phase 0.50
snapshot_3 -> phase 0.75
snapshot_0 -> phase 1.00 / next cycle 0.00
```

The exact phase positions are case-specific, but every snapshot should map to a
normalized phase and a snapshot order in the cycle.

## Runtime Phase Estimation

Runtime data should not assume that wall-clock timing is perfectly reliable.
Runtime phase should be estimated from the current normalized IO vector against
the learned positive cycle prior:

```txt
current IO vector
  -> nearest phase
  -> nearest/current snapshot
  -> target snapshot
```

## Monotonic Constraint

Within one cycle, phase should generally move forward:

```txt
0.10 -> 0.20 -> 0.30
```

Backward jumps are suspicious unless they represent cycle wrap:

```txt
0.98 -> 0.02
```

This means the next cycle has started.

## Cycle Boundary

The first implementation should support two boundary sources:

```txt
explicit boundary:
  dataset or simulator provides cycle_id and cycle_start_t_ms.

inferred boundary:
  phase wraps from near 1.0 back to near 0.0.
```

Explicit metadata wins when available. Phase wrap is the fallback.

## Prediction Phase Grid

For a full cycle or a snapshot transition:

```txt
frame_phase = start_phase + i / 1000 * phase_span
t_ms = cycle_start_t_ms + frame_phase * cycle_period_ms
```

Where:

```txt
i = prediction frame index
phase_span = target_phase - start_phase
```

If a transition crosses the cycle boundary, the implementation should unwrap
the target phase before computing `phase_span`.

## Runtime Correction

When new runtime IO arrives, the engine re-estimates phase. If the estimated
phase differs too much from the current prediction buffer:

```txt
re-anchor phase
regenerate future frames
mark correction event
```

The current past frames are not rewritten; future prediction frames can be
replaced.

## Initial Contract

```txt
training:
  phase is supervised by cycle_start_t_ms and cycle_period_ms.

runtime:
  phase is estimated from normalized IO vector and constrained to move forward.

prediction:
  phase is normalized and frame timing uses cycle_period_ms / prediction_frames.

cycle boundary:
  explicit cycle metadata first, phase wrap second.
```
