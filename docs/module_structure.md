# Module Structure

`dephy_ml_high_speed_implement` follows the reusable module contract from
`dephy_module_golden_sample`.

## Initial Scope

- C11 bitmap frame buffer API.
- Runner character renderer with controllable gait phase, arm drive, leg drive,
  and speed.
- Linux CLI that generates PPM bitmap animation frames and a manifest.
- Extension point for later IO-device simulator controls.

## Integration Direction

The future IO bridge should translate IO simulator events into
`dephy_motion_control_t` values:

- DI/DO/RELAY channels can gate start, stop, direction, or limb enable states.
- AI/AO channels can drive speed, gait phase, stride length, or limb amplitude.
- A product demo can connect generated frames to a matrix display or web view.

