# TODO

## Current Scope: Single Palm Keyframe RL

The active implementation scope is now coordinate-only single-palm movement.
The previous full-body/3D rig work is retained as background, but the next
deliverable is a hand-palm predictor that can make low-rate keyframes behave
like high-rate data on weak/old hardware.

- [ ] Document the single-palm scope in README: old hardware, low-rate IO/keyframes, high-rate predicted frames.
- [ ] Define hand keyframe data: palm position, rotation, grip, hold time, tolerance, and safety flags.
- [ ] Define runtime hand state: current pose, velocity, acceleration, target frame, error, confidence.
- [ ] Add deterministic hand predictor fallback with velocity/acceleration limits and overshoot prevention.
- [ ] Add keyframe runner that advances to the next keyframe only after tolerance is reached.
- [ ] Add CSV/JSONL output for predicted hand frames.
- [ ] Add offline reinforcement-learning environment for single-palm control.
- [ ] Define RL observation vector: current pose, target pose, error, velocity, last action, time budget, safety hold.
- [ ] Define RL action vector: delta position, delta rotation, delta grip, and speed scale.
- [ ] Define RL reward: target progress, smoothness, completion bonus, overshoot penalty, limit/safety penalty.
- [ ] Add trainer that exports a small policy artifact usable by C inference.
- [ ] Add C policy inference path with deterministic fallback when policy is missing or unsafe.
- [ ] Add scenarios: straight move, grip close, turn and move, slow IO fast prediction, overshoot recovery, safety hold.
- [ ] Add tests for target reach, keyframe transition, safety hold, overshoot recovery, policy loading, and CLI output.
- [ ] Mark full-body 3D and 55-joint work as deferred for this phase.

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
