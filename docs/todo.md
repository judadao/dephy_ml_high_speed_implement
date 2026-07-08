# TODO

## Current Scope: Cyclic IO Prediction

The active product direction is now documented in
[`cyclic_io_prediction_direction.md`](cyclic_io_prediction_direction.md).
The next deliverable is a generic cyclic IO prediction engine that learns from
positive periodic IO samples, user-recorded snapshots, and few-shot fine-tune
data. The model should generate 1000 phase-normalized prediction frames per
cycle or key transition while keeping runtime inference under the configured
latency budget.

User-operation topics are deferred for now. The next discussion and
implementation sequence should stay focused on core data/model/runtime
contracts:

- [x] Define the generic IO sample schema draft for `DI`, `DO`, `AI`, `AO`, and `Relay`.
- [x] Define cycle boundary and phase normalization rules.
- [x] Define synthetic dataset generation rules.
- [x] Define model input vector, output channels, and 1000-frame tensor format.
- [x] Define training objectives and negative rejection labels.
- [x] Define runtime correction behavior when new IO arrives.
- [x] Define fail-safe and rule-engine behavior for impossible IO or low confidence.
- [x] Define performance benchmark environment and latency/throughput metrics.
- [x] Define snapshot/key-state data format.
- [x] Define case metadata / IO map format.
- [x] Define result / metrics output format.
- [x] Define planned cyclic IO file and folder layout.
- [x] Define model health display, score, gates, and regression check format.
- [x] Document no-ML known-target baseline interpretation and limits.

## Cyclic IO Implementation TODO

- [ ] Add explicit model health CLI modes: known-target baseline, noisy runtime, negative rejection, and correction.

- [x] Implement `cyclic_io_synthetic_v1` benchmark cases.
- [x] Generate positive, negative, and test datasets following `cyclic_io_dataset_design.md`.
- [x] Add case metadata parser and validator.
- [x] Add snapshot parser and validator.
- [x] Add raw event row parser for `sample_id,t_ms,cycle_id,phase,io_type,slot,channel,value,status,source`.
- [x] Add normalized fixed-vector frame builder with analog normalization and missing-value masks.
- [x] Implement cycle phase normalization and cycle-period detection.
- [x] Build the few-shot fine-tune dataset format for positive periodic samples.
- [x] Add model training targets for phase, snapshot, trajectory, endpoint, smoothness, and noisy convergence losses.
- [x] Implement phase + nearest-snapshot estimation for noisy runtime IO.
- [x] Implement 1000-frame phase-normalized IO trajectory generation.
- [x] Add repository converter from normalized prediction vectors to case-specific slot/channel/value records.
- [x] Add runtime prediction buffer correction and re-anchor metadata.
- [x] Add deterministic fail-safe/rule engine for hard, soft, and warning violations.
- [x] Add convergence validation for noisy runtime IO against target snapshots.
- [x] Add performance benchmark for inference latency and prediction throughput.
- [x] Add result metrics writer for snapshot, phase, smoothness, latency, and accepted/rejected status.
- [x] Add cross-repo flow from `linux_io_device_simul` generic IO samples into the cyclic IO engine.

## Completed Single Palm Keyframe RL

The previous coordinate-only single-palm work is retained as a visual demo and
validation background. It is no longer the final product scope.

- [x] Document the single-palm scope in README: old hardware, low-rate IO/keyframes, high-rate predicted frames.
- [x] Define hand keyframe data: palm position, rotation, grip, hold time, tolerance, and safety flags.
- [x] Define runtime hand state: current pose, velocity, acceleration, target frame, error, confidence.
- [x] Add deterministic hand predictor fallback with velocity/acceleration limits and overshoot prevention.
- [x] Add keyframe runner that advances to the next keyframe only after tolerance is reached.
- [x] Add CSV output for predicted hand frames.
- [x] Add offline reinforcement-learning environment for single-palm control.
- [x] Define RL observation vector: current pose, target pose, error, velocity, last action, time budget, safety hold.
- [x] Define RL action vector: delta position, delta rotation, delta grip, and speed scale.
- [x] Define RL reward: target progress, smoothness, completion bonus, overshoot penalty, limit/safety penalty.
- [x] Add trainer that exports a small policy artifact usable by C inference.
- [x] Add C policy inference path with deterministic fallback when policy is missing or unsafe.
- [x] Add scenarios: straight move, grip close, turn and move, slow IO fast prediction, overshoot recovery, safety hold.
- [x] Add tests for target reach, keyframe transition, safety hold, policy loading, and CLI output.
- [x] Mark full-body 3D and 55-joint work as deferred for this phase.

## Completed Background Work

All initial TODO items are implemented as first-pass, tested building blocks.

- [x] Consume IO-device simulator slot stream output instead of only synthetic replay events.
- [x] Add cross-repo trigger pipeline test: io-device script loop -> implement joint prediction.
- [x] Expand C predictor from 19 coarse joints to 55 higher-detail human joints.
- [x] Add an IO event adapter that maps slot/channel/value inputs to motion controls.
- [x] Add indexed color palette output for LED matrix targets.
- [x] Add benchmark mode for high frame-count generation.
- [x] Define joint-frame JSON schemas for IO samples, predicted joints, and scenario metrics.
- [x] Replace primitive Three.js runner with a named multi-joint rig.
- [x] Add 300ms IO replay and 16ms/33ms prediction timeline visualization.
- [x] Add deterministic gait baseline, interpolation fallback, and residual learner.
- [x] Add GIF/APNG or raw frame streaming helper after the PPM/indexed frame generator is stable.

## Completed Realtime Append Work

- [x] Add append-style realtime keyframe watcher.
- [x] Generate bootstrap, confirmed, and correction prediction segments.
- [x] Support watcher resume from existing `prediction_segments.jsonl`.
- [x] Ignore incomplete trailing CSV rows during append writes.
- [x] Emit `result.json` heartbeat/status counters for realtime runs.
- [x] Record bootstrap positive/negative samples for later prior tuning.
- [x] Add lightweight bootstrap prior training and model export.
- [x] Add realtime JSON schemas for segments, result, and bootstrap samples.
- [x] Add local Linux service wrapper with restart logging.
- [x] Add sibling io-device simulator bridge script.
- [x] Update web to play growing JSONL segments without resetting playback.
- [x] Show realtime result counters in the web panel.
- [x] Replace web demo timer polling with Vite Server-Sent Events.
- [x] Add cross-repo realtime hand e2e check with `linux_io_device_simul`.
- [x] Separate sample/reference keyframes from runtime IO anchors.
- [x] Add runtime IO generator and IO-to-anchor adapter.
- [x] Make realtime watcher consume `--anchors` as the official runtime input.
- [x] Split web demo into runtime anchors, current prediction, and reference samples.
- [x] Add live runtime IO loop output for web demos.
- [x] Simplify web prediction display around the active segment.
- [x] Add realtime web flow regression check for loop startup and current IO display.

## Web Demo Stabilization TODO

- [x] Define the three tab contracts in code and README: Realtime Demo, Prediction, Anchors.
- [x] Keep Realtime Demo state to three concepts only: current runtime IO keyframe, current prediction segment, current prediction row.
- [x] Remove selected anchor state from Realtime Demo playback.
- [x] Split web data parsing and constants out of `web/src/main.jsx`.
- [x] Split hand scene rendering out of `web/src/main.jsx`.
- [x] Split tab panels into focused components after playback state is stable.
- [x] Add regression checks for tab labels, current runtime IO order, prediction row display, and runtime/prediction alignment.
- [x] Re-run web build, SSE check, realtime flow check, and restart the local tmux demo.

## Pending Model Discussion

- [x] Replace the lightweight bootstrap prior with a fuller learned model.
