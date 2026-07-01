# dephy_ml_high_speed_implement

High-speed bitmap animation generator for controllable character motion.

The first target is command-line generation of bitmap frames. Later this repo
can consume IO-device simulator values so digital/analog/relay inputs move a
character's arms and legs, producing a running animation.

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

The `web/` app is a Vite + React + Three.js sandbox for controlling a simple
3D runner rig.

```sh
make -f Makefile.linux web-install
make -f Makefile.linux web
```

Then open `http://127.0.0.1:8091/`.

The 3D rig exposes the same future control ideas as the bitmap API: speed,
gait phase, arm drive, and leg drive. Later, IO-device simulator events can map
slot/channel/value changes into those controls.

## IO + ML Joint Prediction

The longer-term target is a richer 3D joint rig that receives slow IO samples
from `linux_io_device_simul` and predicts smooth intermediate joint frames.

Design notes:

- [IO-driven joint prediction plan](docs/io_ml_joint_prediction.md)

The intended path is to treat 300ms IO samples as sparse anchors, generate
16ms/33ms predicted frames between them, and validate motion with deterministic
scenario tests before using the same idea for robotic-arm compensation.
