#include <dephy_ml_high_speed_implement/hand_predictor.h>

#include <math.h>
#include <string.h>

static float clamp_f32(float value, float min_value, float max_value)
{
    if (value < min_value) {
        return min_value;
    }
    if (value > max_value) {
        return max_value;
    }
    return value;
}

static float approach_f32(float current, float target, float max_delta)
{
    float delta = target - current;

    if (delta > max_delta) {
        return current + max_delta;
    }
    if (delta < -max_delta) {
        return current - max_delta;
    }
    return target;
}

static float vec3_len(float x, float y, float z)
{
    return sqrtf(x * x + y * y + z * z);
}

static void limit_vec3(float *x, float *y, float *z, float max_len)
{
    float len;
    float scale;

    if (!x || !y || !z || max_len < 0.0f) {
        return;
    }

    len = vec3_len(*x, *y, *z);
    if (len <= max_len || len <= 0.000001f) {
        return;
    }

    scale = max_len / len;
    *x *= scale;
    *y *= scale;
    *z *= scale;
}

dephy_hand_predictor_config_t dephy_hand_predictor_default_config(void)
{
    dephy_hand_predictor_config_t config;

    config.render_period_ms = 16;
    config.anchor_period_ms = 300;
    config.max_speed = 1.2f;
    config.max_accel = 6.0f;
    config.max_rot_speed = 3.2f;
    config.max_grip_speed = 4.0f;
    config.kp_pos = 9.0f;
    config.kd_pos = 2.4f;
    config.kp_rot = 7.0f;
    config.kd_rot = 1.8f;
    config.kp_grip = 8.0f;
    return config;
}

dephy_hand_state_t dephy_hand_state_from_keyframe(const dephy_hand_keyframe_t *keyframe)
{
    dephy_hand_state_t state;

    memset(&state, 0, sizeof(state));
    if (!keyframe) {
        return state;
    }

    state.t_ms = keyframe->t_ms;
    state.x = keyframe->x;
    state.y = keyframe->y;
    state.z = keyframe->z;
    state.yaw = keyframe->yaw;
    state.pitch = keyframe->pitch;
    state.roll = keyframe->roll;
    state.grip = keyframe->grip;
    state.confidence = keyframe->safety_hold ? 1.0f : 0.85f;
    state.reached = 1;
    return state;
}

float dephy_hand_state_error_to_keyframe(const dephy_hand_state_t *state,
                                         const dephy_hand_keyframe_t *target)
{
    float position_error;
    float rotation_error;
    float grip_error;

    if (!state || !target) {
        return 1000000.0f;
    }

    position_error = vec3_len(target->x - state->x, target->y - state->y, target->z - state->z);
    rotation_error = vec3_len(target->yaw - state->yaw,
                              target->pitch - state->pitch,
                              target->roll - state->roll) * 0.2f;
    grip_error = fabsf(target->grip - state->grip) * 0.1f;
    return position_error + rotation_error + grip_error;
}

uint8_t dephy_hand_state_reached_keyframe(const dephy_hand_state_t *state,
                                          const dephy_hand_keyframe_t *target)
{
    float tolerance;

    if (!state || !target) {
        return 0;
    }

    tolerance = target->tolerance > 0.0f ? target->tolerance : 0.01f;
    return dephy_hand_state_error_to_keyframe(state, target) <= tolerance ? 1 : 0;
}

void dephy_hand_predict_step(const dephy_hand_predictor_config_t *config,
                             const dephy_hand_state_t *current,
                             const dephy_hand_keyframe_t *target,
                             dephy_hand_state_t *next)
{
    dephy_hand_predictor_config_t local_config;
    float dt;
    float desired_vx;
    float desired_vy;
    float desired_vz;
    float dvx;
    float dvy;
    float dvz;
    float max_dv;
    float max_step;

    if (!current || !target || !next) {
        return;
    }

    local_config = config ? *config : dephy_hand_predictor_default_config();
    if (local_config.render_period_ms == 0) {
        local_config.render_period_ms = 16;
    }

    *next = *current;
    next->t_ms = current->t_ms + local_config.render_period_ms;

    if (target->safety_hold) {
        next->vx = 0.0f;
        next->vy = 0.0f;
        next->vz = 0.0f;
        next->ax = 0.0f;
        next->ay = 0.0f;
        next->az = 0.0f;
        next->error = dephy_hand_state_error_to_keyframe(next, target);
        next->confidence = 1.0f;
        next->reached = dephy_hand_state_reached_keyframe(next, target);
        return;
    }

    dt = (float)local_config.render_period_ms / 1000.0f;
    desired_vx = (target->x - current->x) * local_config.kp_pos - current->vx * local_config.kd_pos;
    desired_vy = (target->y - current->y) * local_config.kp_pos - current->vy * local_config.kd_pos;
    desired_vz = (target->z - current->z) * local_config.kp_pos - current->vz * local_config.kd_pos;
    limit_vec3(&desired_vx, &desired_vy, &desired_vz, local_config.max_speed);

    dvx = desired_vx - current->vx;
    dvy = desired_vy - current->vy;
    dvz = desired_vz - current->vz;
    max_dv = local_config.max_accel * dt;
    limit_vec3(&dvx, &dvy, &dvz, max_dv);

    next->vx = current->vx + dvx;
    next->vy = current->vy + dvy;
    next->vz = current->vz + dvz;
    next->ax = dvx / dt;
    next->ay = dvy / dt;
    next->az = dvz / dt;

    max_step = local_config.max_speed * dt;
    next->x = approach_f32(current->x, current->x + next->vx * dt, max_step);
    next->y = approach_f32(current->y, current->y + next->vy * dt, max_step);
    next->z = approach_f32(current->z, current->z + next->vz * dt, max_step);

    if ((target->x - current->x) * (target->x - next->x) < 0.0f) {
        next->x = target->x;
        next->vx = 0.0f;
    }
    if ((target->y - current->y) * (target->y - next->y) < 0.0f) {
        next->y = target->y;
        next->vy = 0.0f;
    }
    if ((target->z - current->z) * (target->z - next->z) < 0.0f) {
        next->z = target->z;
        next->vz = 0.0f;
    }

    next->yaw = approach_f32(current->yaw, target->yaw, local_config.max_rot_speed * dt);
    next->pitch = approach_f32(current->pitch, target->pitch, local_config.max_rot_speed * dt);
    next->roll = approach_f32(current->roll, target->roll, local_config.max_rot_speed * dt);
    next->grip = clamp_f32(approach_f32(current->grip,
                                        target->grip,
                                        local_config.max_grip_speed * dt),
                           0.0f,
                           1.0f);
    next->error = dephy_hand_state_error_to_keyframe(next, target);
    next->reached = dephy_hand_state_reached_keyframe(next, target);
    next->confidence = clamp_f32(0.65f + (1.0f - next->error) * 0.25f, 0.2f, 0.98f);
}
