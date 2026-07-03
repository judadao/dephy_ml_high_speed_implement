# Cyclic IO Prediction Direction

This repository is moving toward a few-shot fine-tuned cyclic IO prediction
engine. The web hand demo is only a visual aid; the core feature is generic IO
trajectory prediction for slow or old hardware.

## Goal

Users provide positive periodic IO samples from a machine or simulator. The IO
stream can include digital, analog, and relay-style points:

- `DI`
- `DO`
- `AI`
- `AO`
- `Relay`

Users can record or snapshot important key states in the cycle. The model then
learns the cyclic phase, the key snapshot transitions, and the expected IO
trajectory between snapshots. At runtime, even when incoming test IO differs
from the training sample, the model should converge toward the correct snapshot
sequence and produce dense high-speed prediction frames.

## Core Pipeline

```txt
positive IO sample
  -> snapshot/key-state recording
  -> cycle phase normalization
  -> few-shot fine-tune
  -> runtime IO input
  -> phase + nearest snapshot estimate
  -> 1000-frame phase-normalized prediction
  -> convergence validation
```

## Prediction Definition

Prediction is phase-normalized. A cycle or snapshot transition is divided into a
fixed number of prediction frames, commonly 1000:

```txt
prediction_frames = 1000
dt = cycle_period_ms / prediction_frames
```

Examples:

```txt
cycle_period_ms = 300ms  -> 1000 frames -> 0.3ms per frame
cycle_period_ms = 500ms  -> 1000 frames -> 0.5ms per frame
cycle_period_ms = 1000ms -> 1000 frames -> 1.0ms per frame
```

This means 1000 frames represent one normalized cycle or key transition. They
do not represent a fixed wall-clock duration.

Cycle boundary and phase rules are defined in
[`cyclic_io_phase_rules.md`](cyclic_io_phase_rules.md). The initial contract is:

```txt
training phase is supervised
runtime phase is estimated
prediction phase is normalized
cycle boundary uses explicit metadata first and phase wrap second
```

## Data Model Direction

Raw IO samples should preserve point identity and timing:

```txt
timestamp
cycle_id
phase
snapshot_id
io_type
slot
channel
value
confidence
source
```

Analog values (`AI` and `AO`) should be normalized for training and inference.
The raw engineering value should still be retained in dataset metadata or raw
event rows so prediction output can be converted back to the case-specific IO
scale later.

Training and inference can convert those rows into vectors:

```txt
phase
cycle_period_ms
DI vector
DO vector
AI vector
AO vector
Relay vector
current_snapshot
target_snapshot
```

Model output should be a dense trajectory of complete normalized IO vectors:

```txt
1000 x IO vector
```

The model should not directly output only the final case-specific point writes.
Instead, the repository converts each predicted full IO vector back into the
target case's IO point values and extra prediction metadata. This keeps the
model generic while allowing each deployment/test case to decide which slots,
channels, value scales, confidence fields, and metadata are emitted downstream.

Each prediction frame should include:

```txt
frame_index
phase
t_ms
predicted normalized DI vector
predicted normalized DO vector
predicted normalized AI vector
predicted normalized AO vector
predicted normalized Relay vector
target_snapshot
confidence
```

## Few-Shot Fine-Tune

The target is not full zero-shot. The intended workflow is:

```txt
few positive cycle samples
  -> build a process-specific cyclic prior
  -> fine-tune with the user's snapshots
  -> tolerate runtime IO noise and drift
  -> converge to the correct snapshot sequence
```

The model should need only a small number of positive examples for a specific
machine or process.

## Runtime Performance

Prediction speed is a core feature. The system is only useful if inference is
faster than the slow hardware update interval.

Initial runtime goals:

```txt
input IO interval: 300ms / 500ms
prediction output: 1000 frames per cycle or key transition
inference budget: < 10ms
preferred inference budget: < 5ms
```

The runtime may generate a long prediction buffer, but new IO observations can
re-estimate phase and replace future frames.

## Validation Metrics

Core validation should be numeric and independent from the web demo:

```txt
snapshot match rate
phase estimation error
final snapshot error
trajectory smoothness
max velocity
max acceleration
max jerk
inference latency
prediction throughput
runtime noisy IO convergence rate
```

## Discussion Queue

User-operation topics are intentionally deferred for now. Do not prioritize UI
recording flows, manual labeling flows, import/export UX, or web presentation
until the core engine contracts are clearer.

Core topics to discuss and decide next:

```txt
1. IO schema:
   DI / DO / AI / AO / Relay value ranges, normalization, missing values, and
   channel identity.

2. Cycle boundary and phase:
   how cycle start/end is represented and how phase is normalized to 0..1.

3. Dataset generation:
   synthetic positive, negative, and test data generation rules.

4. Model input and output:
   exact input vector, output channels, and 1000-frame prediction tensor.

5. Training objective:
   phase, snapshot, trajectory, endpoint, smoothness, and negative rejection
   losses.

6. Runtime correction:
   how new runtime IO updates the prediction buffer and future frames.

7. Fail-safe and rule engine:
   impossible IO, low confidence, phase mismatch, and fallback behavior.

8. Performance benchmark:
   inference latency, throughput, and 1000-frame generation time.
```

## Current Demo Role

The existing web demo remains useful only as a visual helper:

```txt
Realtime Demo:
  runtime IO + runtime prediction

Prediction:
  sample keyframe + sample-derived prediction

Anchors:
  sample keyframe only
```

Future core work should prioritize IO schema, snapshot recording, training and
fine-tune, phase estimation, prediction engine performance, and validation
tests. Web changes should be limited to visualization unless the demo contract
changes.
