# TODO

## Current Scope: Single Palm Keyframe RL

The active implementation scope is now coordinate-only single-palm movement.
The previous full-body/3D rig work is retained as background, but the next
deliverable is a hand-palm predictor that can make low-rate keyframes behave
like high-rate data on weak/old hardware.

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

## Pending Model Discussion

- [ ] Replace the lightweight bootstrap prior with a fuller learned model.
