# TODO

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
