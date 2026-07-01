# IO-Driven Joint Prediction Plan

## Goal

Build a motion prediction system that can receive slow IO-device simulator
updates, infer the missing motion between those updates, and drive a richer 3D
joint rig smoothly.

The target demo path is:

```txt
io-device simul @ 300ms
  -> IO feature sample
  -> motion intent + observed joint anchors
  -> predictor fills 16ms/33ms joint frames
  -> 3D runner rig
  -> bitmap/matrix/render output
```

This repo owns the predictor, rig control model, training/evaluation loop, and
frame generation. The IO simulator remains the source of slow external signals.

## Important Accuracy Boundary

The system should not promise universal 100% prediction for unseen physical
motion. What it can guarantee is narrower and testable:

- For a fixed scenario library, fixed model version, and fixed validation
  threshold, replay can be deterministic and 100% reproducible.
- For learned movement outside the trained distribution, the system must expose
  prediction confidence and fall back to interpolation, low-speed motion, or
  stop/hold behavior.
- For future robotic-arm compensation, every prediction must be bounded by
  safety limits, velocity/acceleration caps, and error monitors.

In product language: "100% after learning" should mean "100% pass rate on the
defined scenario test suite", not "mathematically perfect on all future inputs".

## Rig Model

The current Three.js sandbox uses primitive limbs. The next rig should define a
joint graph with named degrees of freedom:

```txt
root
pelvis
spine_0
spine_1
neck
head
left_shoulder
left_elbow
left_wrist
right_shoulder
right_elbow
right_wrist
left_hip
left_knee
left_ankle
right_hip
right_knee
right_ankle
```

Each joint state should be represented as:

```txt
joint_id
rotation_x
rotation_y
rotation_z
position_x
position_y
position_z
confidence
source
```

`source` should identify whether a value came from IO observation, learned
prediction, interpolation, inverse kinematics, or safety fallback.

## IO Sampling Model

The IO-device simulator can emit samples every 300ms. Rendering needs smoother
updates:

- 60 FPS target: 16.67ms frame interval.
- 30 FPS target: 33.33ms frame interval.
- 300ms IO interval leaves 9 to 18 missing frames per IO sample.

The predictor must generate intermediate joint states:

```txt
t=0ms      IO sample A
t=16ms     predicted joint frame
t=33ms     predicted joint frame
...
t=300ms    IO sample B
```

The training data should always preserve both timelines:

- `io_t_ms`: coarse external event timestamp.
- `frame_t_ms`: generated or observed animation frame timestamp.

## Feature Mapping

Initial IO mapping can be explicit before training:

```txt
slot1 DI channel 1       -> run enable
slot1 DI channel 2       -> left turn command
slot1 DI channel 3       -> right turn command
slot3 AI channel 1       -> speed target
slot3 AI channel 2       -> stride amplitude
slot5 RELAY channel 1    -> lock/freeze motion
```

Feature vector per 300ms sample:

```txt
run_enable
turn_left
turn_right
speed_target
stride_amplitude
relay_lock
previous_joint_state
previous_joint_velocity
scenario_goal
```

Output vector per render frame:

```txt
all_joint_rotations
all_joint_positions
root_velocity
confidence
```

## Predictor Strategy

Start with a staged predictor instead of jumping straight to a black-box model:

1. Deterministic gait generator
   - Converts speed, turn, and phase into a baseline full joint pose.
   - Always available as fallback.

2. Interpolation layer
   - Fills frames between 300ms IO samples with cubic interpolation or Hermite
     interpolation using velocity estimates.

3. Residual learner
   - Learns correction deltas over the deterministic gait generator.
   - Predicts `joint_delta` rather than full absolute pose first.

4. Confidence gate
   - If model confidence is low or predicted motion violates constraints, use
     deterministic/interpolation fallback.

This makes failure modes debuggable and keeps future robot compensation safer.

## Learning Loop

A scenario should define:

```txt
scenario_id
goal: run_straight | turn_left | turn_right | slow_down | speed_up
input_script: IO trigger script
expected_motion: optional reference joint frames
pass_criteria:
  max_joint_error
  max_foot_slip
  max_root_drift
  min_smoothness
```

Training loop:

1. Run the IO trigger script.
2. Generate baseline 3D motion.
3. Compare predicted joints to reference or scenario constraints.
4. Apply correction learning.
5. Re-run until pass criteria are met or trial limit is reached.
6. Save model version, scenario version, and metrics.

## Test Criteria

For the running demo, a scenario passes only when:

- Foot contact does not slide beyond a defined threshold.
- Root movement matches speed/turn intent.
- Left/right limb phase remains physically plausible.
- No joint exceeds configured angle limits.
- Inter-frame acceleration stays below threshold.
- Replay is deterministic for the same model and script.

For robotic-arm compensation later, add:

- Collision envelope checks.
- Torque/velocity/acceleration caps.
- Emergency stop on low confidence.
- Hard bounded prediction horizon.

## Repository Phases

### Phase 1: Rig + Data Contract

- Replace primitive runner with a named joint graph.
- Add JSON schema for IO samples, joint frames, and scenario scripts.
- Export/import scenario data from the web sandbox.

### Phase 2: 300ms IO Replay

- Add a replay adapter that consumes IO-device simulator trigger scripts.
- Generate 16ms/33ms joint frames between 300ms samples.
- Visualize observed IO anchors vs predicted frames.

### Phase 3: Baseline Predictor

- Implement deterministic gait generator and interpolation fallback.
- Add scenario metrics and pass/fail reports.
- Save generated joint-frame datasets.

### Phase 4: Residual Learning

- Add a small trainable model for correction deltas.
- Keep model artifacts versioned and reproducible.
- Add confidence and fallback behavior.

### Phase 5: Robot Compensation Path

- Introduce safety-constrained prediction.
- Add hardware-safe output adapter contract.
- Require bounded validation before any real actuator use.

