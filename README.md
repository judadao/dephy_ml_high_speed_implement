# dephy_ml_high_speed_implement

High-speed bitmap and 3D joint motion implementation for controllable character motion.

## Current Scope

The active implementation scope is now **single-palm coordinate prediction**.
The goal is to let old or weak Linux hardware provide low-rate keyframes or IO
anchors, then have this repo predict the missing high-rate frames between those
anchors.

Users provide keyframes such as palm position, rotation, grip, tolerance, and
hold time. The predictor reads the current palm state, dynamically adjusts the
movement direction, generates interpolation frames, and keeps correcting until
the current keyframe is complete. This phase validates by coordinate data only;
it does not require 3D rendering.

The target pattern is:

```txt
low-rate keyframes / IO anchors
  -> deterministic or RL hand policy
  -> 16ms/33ms predicted palm frames
  -> CSV/JSONL data for validation
```

This is meant to make weak hardware behave closer to a high-speed data source
by filling the missing frames with bounded prediction, not by pretending the
hardware itself is actually sampling faster.

## Existing Paths

The repo also has earlier exploratory paths:

- Generate bitmap or indexed matrix animation frames from the command line.
- Consume slow IO samples emitted by `linux_io_device_simul`, convert them into
  a named 3D joint timeline, and predict smooth motion frames between sparse IO
  updates.

This is aimed at machines like a UC-4510-class Linux edge controller where IO
polling or upstream protocol traffic may only arrive every 300ms. The simulator
keeps those slow IO samples as trusted anchors, then predicts 16ms/33ms joint
frames locally so the motion layer behaves closer to a high-speed control loop.
The same pattern is intended for later mechanical-arm compensation: slow sensor
or IO updates provide reality checks, while the local predictor fills the gap.

## Build And Test

```sh
make -f Makefile.linux
make -f Makefile.linux test
make -f Makefile.linux demo
make -f Makefile.linux web-install
make -f Makefile.linux web
```

## Generate Frames

```sh
build_out/dephy_bitmap_anim --out build_out/run_frames --frames 24 --width 128 --height 96 --cycles 2
```

Output:

- `frame_0000.ppm`, `frame_0001.ppm`, ...
- `manifest.txt`

The PPM format is intentionally simple and easy to inspect or convert:

```sh
ffmpeg -framerate 12 -i build_out/run_frames/frame_%04d.ppm build_out/runner.gif
```

For LED matrix or indexed targets:

```sh
build_out/dephy_bitmap_anim --out build_out/matrix_frames --frames 24 --width 64 --height 32 --format indexed
```

This writes `frame_0000.pgm` style indexed frames and stores the RGB palette in
`manifest.txt`.

For raw RGB frame streaming targets:

```sh
build_out/dephy_bitmap_anim --out build_out/raw_frames --frames 24 --width 64 --height 32 --format raw
```

Each `.raw` file is packed as `width * height * 3` bytes in RGB order.

Benchmark high frame-count generation without writing frame files:

```sh
build_out/dephy_bitmap_anim --width 64 --height 32 --benchmark 1000
```

## Motion Control Direction

The public API exposes `dephy_motion_control_t`, which is the seam for later
IO-device simulator integration:

```c
typedef struct {
    float gait_phase;
    float speed;
    float arm_drive;
    float leg_drive;
    int ground_y;
    int center_x;
    int center_y;
} dephy_motion_control_t;
```

Expected future mapping:

- DI/DO/RELAY value `1` can enable movement or a limb group.
- AI/AO values greater than `0` can scale `speed`, `arm_drive`, or `leg_drive`.
- Repeated IO events can advance `gait_phase`.

## 3D Control Sandbox

The `web/` app is a Vite + React + Three.js sandbox for controlling a named
runner rig. The C predictor currently emits 55 joints including spine segments,
clavicles, scapula points, fingers, heels, toes, forearm twist joints, and the
major arm/leg joints.

```sh
make -f Makefile.linux web-install
make -f Makefile.linux web
```

Then open `http://127.0.0.1:8091/`.

The 3D rig exposes the same control ideas as the C predictor: speed, gait
phase, arm drive, leg drive, stride, and turn. The UI also shows 300ms IO
anchors and the number of predicted frames generated between anchors.

## IO + ML Joint Prediction

The C predictor receives slow IO samples from `linux_io_device_simul` style
events and predicts smooth intermediate joint frames.

Full pipeline from the sibling IO simulator repo:

```sh
../linux_io_device_simul/build_out/linux_io_device_simul \
  --slot-stream \
  --loop 2 \
  --sample-ms 300 \
  ../linux_io_device_simul/scripts/motion_pipeline.trigger \
  | build_out/dephy_joint_replay --from-io-stream > build_out/joints.csv
```

The IO simulator remains responsible for looping required node actions at a
slow sample cadence. This repo treats those events as observed anchors and
generates 16ms/33ms predicted joint frames between anchors.

Replay a sparse IO timeline:

```sh
build_out/dephy_joint_replay --render-ms 16 --io-ms 300 --samples 4 > build_out/joints.csv
```

Replay with direct slot/type/channel/value events:

```sh
build_out/dephy_joint_replay --samples 2 --event 1:di:1:1 --event 2:ai:1:80 --event 3:ai:2:65
```

Event mapping:

- `di/do channel 1`: run gate.
- `di/do channel 2`: turn left.
- `di/do channel 3`: turn right.
- `ai/ao channel 1`: speed target.
- `ai/ao channel 2`: stride amplitude.
- `ai/ao channel 3`: arm drive.
- `ai/ao channel 4`: leg drive.
- `relay channel 1`: motion lock.
- `di/do channels 4-8`: limb enable and safety hold gates.
- `ai/ao channels 5-16`: hand grip, foot pressure, torso/head/balance,
  cadence, knee lift, ankle push, and shoulder roll.
- `relay channels 2-8`: elbow bend, wrist twist, hip sway, spine twist, toe
  curl, prediction aggression, and observed error flags.

The current predictor has a deterministic 55-joint gait baseline, linear
interpolation between 300ms anchors, confidence scoring, and a small residual
learner API.
The residual learner observes target joint-frame error and applies an EMA
correction, giving the repo a tested fallback path before a larger ML model is
introduced.

Design notes:

- [IO-driven joint prediction plan](docs/io_ml_joint_prediction.md)

The intended path is to treat 300ms IO samples as sparse anchors, generate
16ms/33ms predicted frames between them, and validate motion with deterministic
scenario tests before using the same idea for robotic-arm compensation.
