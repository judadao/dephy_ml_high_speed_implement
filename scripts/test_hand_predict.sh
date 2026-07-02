#!/bin/sh
set -eu

out="${OUTDIR:-build_out}/hand_straight.csv"
result="${OUTDIR:-build_out}/hand_straight_result.json"
"${OUTDIR:-build_out}/dephy_hand_predict" \
    --keyframes scenarios/hand/straight_move.csv \
    --render-ms 16 \
    --result "$result" > "$out"

grep -q '^frame_t_ms,target_frame,palm_x,palm_y,palm_z' "$out"
grep -q ',reach,' "$out"
grep -q '"format": "dephy_hand_prediction_result_v1"' "$result"
grep -q '"mode": "keyframe"' "$result"
grep -q '"success": true' "$result"
tail -n 1 "$out" | awk -F, '{ if ($15 != "1") exit 1; if ($13 > 0.02) exit 1; }'

grip_out="${OUTDIR:-build_out}/hand_grip.csv"
"${OUTDIR:-build_out}/dephy_hand_predict" \
    --keyframes scenarios/hand/grip_close.csv \
    --render-ms 16 > "$grip_out"
tail -n 1 "$grip_out" | awk -F, '{ if ($9 < 0.98) exit 1; }'

hold_out="${OUTDIR:-build_out}/hand_hold.csv"
"${OUTDIR:-build_out}/dephy_hand_predict" \
    --keyframes scenarios/hand/safety_hold.csv \
    --render-ms 16 > "$hold_out"
tail -n 1 "$hold_out" | awk -F, '{ if ($3 != "0.00000") exit 1; if ($14 != "1.000") exit 1; }'

slow_out="${OUTDIR:-build_out}/hand_slow_io.csv"
"${OUTDIR:-build_out}/dephy_hand_predict" \
    --keyframes scenarios/hand/slow_io_fast_prediction.csv \
    --render-ms 16 > "$slow_out"
grep -q ',anchor_900,' "$slow_out"
tail -n 1 "$slow_out" | awk -F, '{ if ($15 != "1") exit 1; if ($13 > 0.02) exit 1; }'

recovery_out="${OUTDIR:-build_out}/hand_overshoot_recovery.csv"
"${OUTDIR:-build_out}/dephy_hand_predict" \
    --keyframes scenarios/hand/overshoot_recovery.csv \
    --render-ms 16 \
    --max-speed 2.0 \
    --max-accel 8.0 > "$recovery_out"
grep -q ',return_precise,' "$recovery_out"
tail -n 1 "$recovery_out" | awk -F, '{ if ($15 != "1") exit 1; if ($3 < 0.24 || $3 > 0.26) exit 1; }'

io_repo="$(pwd)/../linux_io_device_simul"
if [ -x "$io_repo/build_out/linux_io_device_simul" ]; then
    stream_out="${OUTDIR:-build_out}/hand_device_stream.out"
    stream_frames="${OUTDIR:-build_out}/hand_device_stream_frames.csv"
    "$io_repo/build_out/linux_io_device_simul" \
        --hand-stream \
        --loop 1 \
        --sample-ms 300 \
        "$io_repo/scripts/hand_keyframe_demo.script" > "$stream_out"
    "${OUTDIR:-build_out}/dephy_hand_predict" \
        --from-hand-stream "$stream_out" \
        --policy examples/hand/hand_policy.json \
        --render-ms 16 > "$stream_frames"
    grep -q ',closed_reach,' "$stream_frames"
    tail -n 1 "$stream_frames" | awk -F, '{ if ($15 != "1") exit 1; if ($13 > 0.02) exit 1; }'

    observed_io="${OUTDIR:-build_out}/hand_io_observed.out"
    observed_hand="${OUTDIR:-build_out}/hand_io_observed_keyframes.out"
    observed_csv="${OUTDIR:-build_out}/hand_io_observed_keyframes.csv"
    observed_frames="${OUTDIR:-build_out}/hand_io_observed_frames.csv"
    observed_result="${OUTDIR:-build_out}/hand_io_observed_result.json"
    "$io_repo/build_out/linux_io_device_simul" \
        --slot-stream \
        --loop 1 \
        --sample-ms 40 \
        "$io_repo/scripts/hand_io_observed.trigger" > "$observed_io"
    "$io_repo/build_out/linux_io_device_simul" \
        --io-hand-adapter \
        --frame-prefix io_obs \
        "$observed_io" > "$observed_hand"
    "$io_repo/build_out/linux_io_device_simul" \
        --record-hand-keyframes \
        "$observed_hand" > "$observed_csv"
    "${OUTDIR:-build_out}/dephy_hand_predict" \
        --keyframes "$observed_csv" \
        --observed-input \
        --policy examples/hand/hand_policy.json \
        --render-ms 16 \
        --result "$observed_result" > "$observed_frames"
    grep -q ',io_obs_0024,' "$observed_frames"
    grep -q '"mode": "observed"' "$observed_result"
    grep -q '"observations": 39' "$observed_result"
    grep -q '"success": true' "$observed_result"
fi
