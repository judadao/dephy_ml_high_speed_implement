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
make -f Makefile.linux hand-rl-check
make -f Makefile.linux demo
make -f Makefile.linux web-install
make -f Makefile.linux web
```

## Single Palm Keyframe Prediction

Run deterministic bounded prediction:

```sh
build_out/dephy_hand_predict \
  --keyframes scenarios/hand/slow_io_fast_prediction.csv \
  --render-ms 16 > build_out/hand_frames.csv
```

Train a small dependency-free RL policy:

```sh
python3 scripts/train_hand_policy.py \
  --scenario scenarios/hand/straight_move.csv \
  --scenario scenarios/hand/grip_close.csv \
  --scenario scenarios/hand/turn_and_move.csv \
  --out build_out/hand_policy.json
```

Run the C predictor with the exported policy:

```sh
build_out/dephy_hand_predict \
  --keyframes scenarios/hand/turn_and_move.csv \
  --policy build_out/hand_policy.json \
  --render-ms 16 > build_out/hand_policy_frames.csv
```

CSV output:

```txt
frame_t_ms,target_frame,palm_x,palm_y,palm_z,yaw,pitch,roll,grip,vx,vy,vz,error,confidence,reached
```

The current policy artifact is a small gain-based controller trained in the
offline environment. Unsafe or missing policies fall back to the deterministic
bounded predictor.

## Recorded Keyframe Workflow

The expected production-like path is:

```txt
user IO / device simulator
  -> record low-rate keyframe anchors
  -> train or load a hand policy
  -> predict high-rate frames from noisy observed IO
  -> keep correcting until each keyframe is reached
```

The simulator repo can record its hand keyframe stream into the CSV format used
here:

```sh
../linux_io_device_simul/build_out/linux_io_device_simul \
  --hand-stream \
  --loop 1 \
  --sample-ms 300 \
  ../linux_io_device_simul/scripts/hand_keyframe_demo.script \
  > build_out/hand_device_stream.out

../linux_io_device_simul/build_out/linux_io_device_simul \
  --record-hand-keyframes \
  build_out/hand_device_stream.out \
  > build_out/recorded_hand_keyframes.csv
```

Use the recorded keyframes directly:

```sh
build_out/dephy_hand_predict \
  --keyframes build_out/recorded_hand_keyframes.csv \
  --policy examples/hand/hand_policy.json \
  --render-ms 16 > build_out/recorded_hand_frames.csv
```

Or train a new policy from recorded/scenario keyframes:

```sh
python3 scripts/train_hand_policy.py \
  --scenario build_out/recorded_hand_keyframes.csv \
  --out build_out/recorded_hand_policy.json
```

Real IO will not be perfectly stable. The predictor treats keyframes as anchors,
uses the current observed palm state as feedback, and dynamically adjusts
position, rotation, grip, and velocity until the target keyframe is reached.

## Web Hand Demo

The Vite web demo visualizes the single-palm scope. The left side renders hand
joint points and bones. The right side shows a CSV keyframe stream that behaves
like a simulator sending one anchor every 300ms, while the implement side
generates 16ms predicted frames between anchors.

```sh
make -f Makefile.linux web-install
make -f Makefile.linux web
```

Then open `http://127.0.0.1:8091/`.

The demo is browser-side only: it loads CSV keyframe fixtures that mirror the
device loop, then applies the same bounded prediction idea to update palm
position, rotation, grip, error, confidence, and target keyframe data live.

The active demo data is loaded from external fixtures instead of being hardcoded
inside React:

- `examples/hand/hand_keyframes.csv`: source keyframe anchors generated from
  the device-simulator script shape.
- `examples/hand/hand_policy.json`: source prediction policy parameters.

`web/public/demo/` is only the Vite-served copy. It is generated by:

```sh
make -f Makefile.linux web-demo-data
```

The `web`, `web-build`, and `web-render-check` targets run this sync
automatically, so web demo data stays aligned with the CLI/test fixtures.

The intended device-to-implement path is:

```sh
../linux_io_device_simul/build_out/linux_io_device_simul \
  --hand-stream \
  --loop 1 \
  --sample-ms 300 \
  ../linux_io_device_simul/scripts/hand_keyframe_demo.script \
  > build_out/hand_device_stream.out

build_out/dephy_hand_predict \
  --from-hand-stream build_out/hand_device_stream.out \
  --policy examples/hand/hand_policy.json \
  --render-ms 16 > build_out/hand_device_frames.csv
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
