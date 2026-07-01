#include <dephy_ml_high_speed_implement/joint_predictor.h>

#include <math.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

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

static float lerp_f32(float a, float b, float t)
{
    return a + (b - a) * t;
}

static void set_joint(dephy_joint_frame_t *frame,
                      dephy_joint_id_t joint,
                      float rx,
                      float ry,
                      float rz,
                      float px,
                      float py,
                      float pz)
{
    frame->joints[joint].rx = rx;
    frame->joints[joint].ry = ry;
    frame->joints[joint].rz = rz;
    frame->joints[joint].px = px;
    frame->joints[joint].py = py;
    frame->joints[joint].pz = pz;
}

const char *dephy_joint_name(dephy_joint_id_t joint)
{
    static const char *names[DEPHY_JOINT_COUNT] = {
        "root",
        "pelvis",
        "spine_0",
        "spine_1",
        "neck",
        "head",
        "left_shoulder",
        "left_elbow",
        "left_wrist",
        "right_shoulder",
        "right_elbow",
        "right_wrist",
        "left_hip",
        "left_knee",
        "left_ankle",
        "right_hip",
        "right_knee",
        "right_ankle",
        "center_mass",
        "spine_2",
        "left_clavicle",
        "right_clavicle",
        "jaw",
        "left_eye",
        "right_eye",
        "left_thumb_0",
        "left_thumb_1",
        "left_index_0",
        "left_index_1",
        "left_middle_0",
        "left_middle_1",
        "left_ring_0",
        "left_ring_1",
        "left_pinky_0",
        "left_pinky_1",
        "right_thumb_0",
        "right_thumb_1",
        "right_index_0",
        "right_index_1",
        "right_middle_0",
        "right_middle_1",
        "right_ring_0",
        "right_ring_1",
        "right_pinky_0",
        "right_pinky_1",
        "left_heel",
        "left_toe",
        "right_heel",
        "right_toe",
        "left_scapula",
        "right_scapula",
        "left_forearm_twist",
        "right_forearm_twist",
    };

    if (joint >= DEPHY_JOINT_COUNT) {
        return "unknown";
    }
    return names[joint];
}

dephy_joint_predictor_config_t dephy_joint_predictor_default_config(void)
{
    dephy_joint_predictor_config_t config;

    config.render_period_ms = 16;
    config.io_period_ms = 300;
    config.max_speed = 3.0f;
    config.fallback_confidence = 0.72f;
    return config;
}

dephy_io_motion_sample_t dephy_io_motion_sample_default(uint32_t t_ms)
{
    dephy_io_motion_sample_t sample;

    memset(&sample, 0, sizeof(sample));
    sample.t_ms = t_ms;
    sample.run_enable = 1.0f;
    sample.speed_target = 1.0f;
    sample.stride_amplitude = 1.0f;
    sample.arm_drive = 1.0f;
    sample.leg_drive = 1.0f;
    sample.left_arm_enable = 1.0f;
    sample.right_arm_enable = 1.0f;
    sample.left_leg_enable = 1.0f;
    sample.right_leg_enable = 1.0f;
    sample.cadence_target = 1.0f;
    sample.knee_lift = 1.0f;
    sample.ankle_push = 1.0f;
    sample.prediction_aggression = 0.5f;
    return sample;
}

int dephy_io_motion_sample_apply_event(dephy_io_motion_sample_t *sample,
                                       const dephy_io_event_t *event)
{
    float normalized;

    if (!sample || !event || event->slot == 0 || event->slot > 20) {
        return -1;
    }

    normalized = clamp_f32(event->value, 0.0f, 100.0f) / 100.0f;
    if (event->kind == DEPHY_IO_KIND_DI || event->kind == DEPHY_IO_KIND_DO) {
        if (event->channel == 1) {
            sample->run_enable = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 2) {
            sample->turn_left = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 3) {
            sample->turn_right = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 4) {
            sample->left_arm_enable = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 5) {
            sample->right_arm_enable = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 6) {
            sample->left_leg_enable = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 7) {
            sample->right_leg_enable = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 8) {
            sample->safety_hold = event->value > 0.0f ? 1.0f : 0.0f;
        }
    } else if (event->kind == DEPHY_IO_KIND_AI || event->kind == DEPHY_IO_KIND_AO) {
        if (event->channel == 1) {
            sample->speed_target = normalized * 3.0f;
        } else if (event->channel == 2) {
            sample->stride_amplitude = normalized * 2.0f;
        } else if (event->channel == 3) {
            sample->arm_drive = normalized * 2.0f;
        } else if (event->channel == 4) {
            sample->leg_drive = normalized * 2.0f;
        } else if (event->channel == 5) {
            sample->left_hand_grip = normalized;
        } else if (event->channel == 6) {
            sample->right_hand_grip = normalized;
        } else if (event->channel == 7) {
            sample->left_foot_pressure = normalized;
        } else if (event->channel == 8) {
            sample->right_foot_pressure = normalized;
        } else if (event->channel == 9) {
            sample->torso_pitch = normalized * 2.0f - 1.0f;
        } else if (event->channel == 10) {
            sample->head_yaw = normalized * 2.0f - 1.0f;
        } else if (event->channel == 11) {
            sample->balance_x = normalized * 2.0f - 1.0f;
        } else if (event->channel == 12) {
            sample->balance_z = normalized * 2.0f - 1.0f;
        } else if (event->channel == 13) {
            sample->cadence_target = normalized * 2.0f;
        } else if (event->channel == 14) {
            sample->knee_lift = normalized * 2.0f;
        } else if (event->channel == 15) {
            sample->ankle_push = normalized * 2.0f;
        } else if (event->channel == 16) {
            sample->shoulder_roll = normalized * 2.0f - 1.0f;
        }
    } else if (event->kind == DEPHY_IO_KIND_RELAY) {
        if (event->channel == 1) {
            sample->relay_lock = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 2) {
            sample->elbow_bend = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 3) {
            sample->wrist_twist = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 4) {
            sample->hip_sway = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 5) {
            sample->spine_twist = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 6) {
            sample->toe_curl = event->value > 0.0f ? 1.0f : 0.0f;
        } else if (event->channel == 7) {
            sample->prediction_aggression = event->value > 0.0f ? 1.0f : 0.25f;
        } else if (event->channel == 8) {
            sample->observed_error = event->value > 0.0f ? 1.0f : 0.0f;
        }
    } else {
        return -1;
    }

    return 0;
}

void dephy_joint_predict_frame(const dephy_joint_predictor_config_t *config,
                               const dephy_io_motion_sample_t *a,
                               const dephy_io_motion_sample_t *b,
                               uint32_t frame_t_ms,
                               dephy_joint_frame_t *out)
{
    float span_ms;
    float t;
    float speed;
    float stride;
    float arm_drive;
    float leg_drive;
    float run_gate;
    float lock_gate;
    float turn;
    float phase;
    float swing;
    float counter;
    float root_x;
    float root_y;
    float yaw;
    float left_arm_gate;
    float right_arm_gate;
    float left_leg_gate;
    float right_leg_gate;
    float left_grip;
    float right_grip;
    float left_pressure;
    float right_pressure;
    float torso_pitch;
    float head_yaw;
    float balance_x;
    float balance_z;
    float cadence;
    float knee_lift;
    float ankle_push;
    float shoulder_roll;
    float elbow_bend;
    float wrist_twist;
    float hip_sway;
    float spine_twist;
    float toe_curl;
    float aggression;
    float left_arm_swing;
    float right_arm_swing;
    float left_leg_swing;
    float right_leg_swing;
    float left_knee_bend;
    float right_knee_bend;
    dephy_joint_predictor_config_t local_config;

    if (!out || !a || !b) {
        return;
    }

    local_config = config ? *config : dephy_joint_predictor_default_config();
    memset(out, 0, sizeof(*out));
    out->frame_t_ms = frame_t_ms;

    span_ms = (float)(b->t_ms > a->t_ms ? b->t_ms - a->t_ms : local_config.io_period_ms);
    t = span_ms > 0.0f ? ((float)(frame_t_ms - a->t_ms) / span_ms) : 0.0f;
    t = clamp_f32(t, 0.0f, 1.0f);

    run_gate = lerp_f32(a->run_enable, b->run_enable, t);
    lock_gate = clamp_f32(lerp_f32(a->relay_lock, b->relay_lock, t) +
                          lerp_f32(a->safety_hold, b->safety_hold, t), 0.0f, 1.0f);
    speed = lerp_f32(a->speed_target, b->speed_target, t) * run_gate * (1.0f - lock_gate);
    speed = clamp_f32(speed, 0.0f, local_config.max_speed);
    stride = clamp_f32(lerp_f32(a->stride_amplitude, b->stride_amplitude, t), 0.0f, 2.0f);
    arm_drive = clamp_f32(lerp_f32(a->arm_drive, b->arm_drive, t), 0.0f, 2.0f);
    leg_drive = clamp_f32(lerp_f32(a->leg_drive, b->leg_drive, t), 0.0f, 2.0f);
    turn = clamp_f32(lerp_f32(a->turn_right - a->turn_left,
                              b->turn_right - b->turn_left,
                              t), -1.0f, 1.0f);
    left_arm_gate = clamp_f32(lerp_f32(a->left_arm_enable, b->left_arm_enable, t), 0.0f, 1.0f);
    right_arm_gate = clamp_f32(lerp_f32(a->right_arm_enable, b->right_arm_enable, t), 0.0f, 1.0f);
    left_leg_gate = clamp_f32(lerp_f32(a->left_leg_enable, b->left_leg_enable, t), 0.0f, 1.0f);
    right_leg_gate = clamp_f32(lerp_f32(a->right_leg_enable, b->right_leg_enable, t), 0.0f, 1.0f);
    left_grip = clamp_f32(lerp_f32(a->left_hand_grip, b->left_hand_grip, t), 0.0f, 1.0f);
    right_grip = clamp_f32(lerp_f32(a->right_hand_grip, b->right_hand_grip, t), 0.0f, 1.0f);
    left_pressure = clamp_f32(lerp_f32(a->left_foot_pressure, b->left_foot_pressure, t), 0.0f, 1.0f);
    right_pressure = clamp_f32(lerp_f32(a->right_foot_pressure, b->right_foot_pressure, t), 0.0f, 1.0f);
    torso_pitch = clamp_f32(lerp_f32(a->torso_pitch, b->torso_pitch, t), -1.0f, 1.0f);
    head_yaw = clamp_f32(lerp_f32(a->head_yaw, b->head_yaw, t), -1.0f, 1.0f);
    balance_x = clamp_f32(lerp_f32(a->balance_x, b->balance_x, t), -1.0f, 1.0f);
    balance_z = clamp_f32(lerp_f32(a->balance_z, b->balance_z, t), -1.0f, 1.0f);
    cadence = clamp_f32(lerp_f32(a->cadence_target, b->cadence_target, t), 0.2f, 2.0f);
    knee_lift = clamp_f32(lerp_f32(a->knee_lift, b->knee_lift, t), 0.0f, 2.0f);
    ankle_push = clamp_f32(lerp_f32(a->ankle_push, b->ankle_push, t), 0.0f, 2.0f);
    shoulder_roll = clamp_f32(lerp_f32(a->shoulder_roll, b->shoulder_roll, t), -1.0f, 1.0f);
    elbow_bend = clamp_f32(lerp_f32(a->elbow_bend, b->elbow_bend, t), 0.0f, 1.0f);
    wrist_twist = clamp_f32(lerp_f32(a->wrist_twist, b->wrist_twist, t), 0.0f, 1.0f);
    hip_sway = clamp_f32(lerp_f32(a->hip_sway, b->hip_sway, t), 0.0f, 1.0f);
    spine_twist = clamp_f32(lerp_f32(a->spine_twist, b->spine_twist, t), 0.0f, 1.0f);
    toe_curl = clamp_f32(lerp_f32(a->toe_curl, b->toe_curl, t), 0.0f, 1.0f);
    aggression = clamp_f32(lerp_f32(a->prediction_aggression, b->prediction_aggression, t), 0.0f, 1.0f);

    phase = ((float)frame_t_ms / 300.0f) * speed * cadence;
    phase -= floorf(phase);
    swing = sinf(phase * 2.0f * (float)M_PI);
    counter = sinf(phase * 2.0f * (float)M_PI + (float)M_PI);
    root_x = speed * ((float)frame_t_ms / 1000.0f);
    root_y = fabsf(cosf(phase * 2.0f * (float)M_PI)) * 0.05f * speed;
    yaw = turn * 0.45f;
    left_arm_swing = swing * arm_drive * left_arm_gate;
    right_arm_swing = counter * arm_drive * right_arm_gate;
    left_leg_swing = counter * leg_drive * stride * left_leg_gate;
    right_leg_swing = swing * leg_drive * stride * right_leg_gate;
    left_knee_bend = fabsf(counter) * leg_drive * stride * knee_lift * left_leg_gate;
    right_knee_bend = fabsf(swing) * leg_drive * stride * knee_lift * right_leg_gate;

    out->confidence = lock_gate > 0.5f ? 1.0f :
        clamp_f32(local_config.fallback_confidence + 0.2f * run_gate + aggression * 0.06f, 0.0f, 1.0f);

    set_joint(out, DEPHY_JOINT_ROOT, 0.0f, yaw, 0.0f, root_x + balance_x * 0.04f, root_y, balance_z * 0.04f);
    set_joint(out, DEPHY_JOINT_PELVIS, 0.08f * swing + torso_pitch * 0.08f, yaw * 0.4f, hip_sway * 0.08f, root_x + balance_x * 0.05f, 0.9f + root_y, balance_z * 0.04f);
    set_joint(out, DEPHY_JOINT_SPINE_0, -0.06f * swing + torso_pitch * 0.12f, yaw * 0.25f, spine_twist * 0.06f, root_x + balance_x * 0.04f, 1.25f + root_y, balance_z * 0.03f);
    set_joint(out, DEPHY_JOINT_SPINE_1, -0.08f * swing + torso_pitch * 0.16f, yaw * 0.2f, spine_twist * 0.1f, root_x + balance_x * 0.03f, 1.55f + root_y, balance_z * 0.02f);
    set_joint(out, DEPHY_JOINT_NECK, 0.03f * counter, yaw * 0.15f + head_yaw * 0.12f, 0.0f, root_x, 1.9f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_HEAD, 0.02f * counter, yaw * 0.1f + head_yaw * 0.28f, 0.0f, root_x, 2.15f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_LEFT_SHOULDER, left_arm_swing * 0.8f, yaw, 0.18f + shoulder_roll * 0.15f, root_x - 0.32f, 1.65f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_LEFT_ELBOW, left_arm_swing * 0.55f + 0.45f + elbow_bend * 0.35f, 0.0f, 0.0f, root_x - 0.5f, 1.28f + root_y, left_arm_swing * 0.08f);
    set_joint(out, DEPHY_JOINT_LEFT_WRIST, left_arm_swing * 0.35f, wrist_twist * 0.4f, 0.0f, root_x - 0.56f, 0.95f + root_y, left_arm_swing * 0.15f);
    set_joint(out, DEPHY_JOINT_RIGHT_SHOULDER, right_arm_swing * 0.8f, yaw, -0.18f - shoulder_roll * 0.15f, root_x + 0.32f, 1.65f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_RIGHT_ELBOW, right_arm_swing * 0.55f + 0.45f + elbow_bend * 0.35f, 0.0f, 0.0f, root_x + 0.5f, 1.28f + root_y, right_arm_swing * 0.08f);
    set_joint(out, DEPHY_JOINT_RIGHT_WRIST, right_arm_swing * 0.35f, -wrist_twist * 0.4f, 0.0f, root_x + 0.56f, 0.95f + root_y, right_arm_swing * 0.15f);
    set_joint(out, DEPHY_JOINT_LEFT_HIP, left_leg_swing * 0.75f, yaw * 0.3f, hip_sway * 0.08f, root_x - 0.16f, 0.9f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_LEFT_KNEE, left_knee_bend * 0.95f, 0.0f, 0.0f, root_x - 0.22f, 0.48f + left_pressure * 0.04f, left_leg_swing * 0.12f);
    set_joint(out, DEPHY_JOINT_LEFT_ANKLE, -fabsf(counter) * 0.45f * ankle_push, 0.0f, 0.0f, root_x - 0.28f - counter * stride * 0.28f, 0.05f, left_leg_swing * 0.18f);
    set_joint(out, DEPHY_JOINT_RIGHT_HIP, right_leg_swing * 0.75f, yaw * 0.3f, -hip_sway * 0.08f, root_x + 0.16f, 0.9f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_RIGHT_KNEE, right_knee_bend * 0.95f, 0.0f, 0.0f, root_x + 0.22f, 0.48f + right_pressure * 0.04f, right_leg_swing * 0.12f);
    set_joint(out, DEPHY_JOINT_RIGHT_ANKLE, -fabsf(swing) * 0.45f * ankle_push, 0.0f, 0.0f, root_x + 0.28f - swing * stride * 0.28f, 0.05f, right_leg_swing * 0.18f);
    set_joint(out, DEPHY_JOINT_CENTER_MASS, 0.0f, yaw, 0.0f, root_x + balance_x * 0.06f, 1.2f + root_y, balance_z * 0.06f);
    set_joint(out, DEPHY_JOINT_SPINE_2, -0.09f * swing + torso_pitch * 0.18f, yaw * 0.18f, spine_twist * 0.14f, root_x, 1.72f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_LEFT_CLAVICLE, left_arm_swing * 0.2f, yaw * 0.2f, shoulder_roll * 0.2f, root_x - 0.18f, 1.77f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_RIGHT_CLAVICLE, right_arm_swing * 0.2f, yaw * 0.2f, -shoulder_roll * 0.2f, root_x + 0.18f, 1.77f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_JAW, 0.04f * fabsf(swing), head_yaw * 0.2f, 0.0f, root_x, 2.05f + root_y, 0.03f);
    set_joint(out, DEPHY_JOINT_LEFT_EYE, 0.0f, head_yaw * 0.25f, 0.0f, root_x - 0.06f, 2.21f + root_y, 0.09f);
    set_joint(out, DEPHY_JOINT_RIGHT_EYE, 0.0f, head_yaw * 0.25f, 0.0f, root_x + 0.06f, 2.21f + root_y, 0.09f);
    set_joint(out, DEPHY_JOINT_LEFT_THUMB_0, left_grip * 0.45f, wrist_twist * 0.2f, 0.25f, root_x - 0.61f, 0.93f + root_y, left_arm_swing * 0.17f);
    set_joint(out, DEPHY_JOINT_LEFT_THUMB_1, left_grip * 0.7f, wrist_twist * 0.2f, 0.35f, root_x - 0.65f, 0.88f + root_y, left_arm_swing * 0.2f);
    set_joint(out, DEPHY_JOINT_LEFT_INDEX_0, left_grip * 0.55f, 0.0f, 0.05f, root_x - 0.57f, 0.86f + root_y, left_arm_swing * 0.18f);
    set_joint(out, DEPHY_JOINT_LEFT_INDEX_1, left_grip * 0.85f, 0.0f, 0.06f, root_x - 0.58f, 0.8f + root_y, left_arm_swing * 0.19f);
    set_joint(out, DEPHY_JOINT_LEFT_MIDDLE_0, left_grip * 0.6f, 0.0f, 0.0f, root_x - 0.55f, 0.85f + root_y, left_arm_swing * 0.18f);
    set_joint(out, DEPHY_JOINT_LEFT_MIDDLE_1, left_grip * 0.9f, 0.0f, 0.0f, root_x - 0.55f, 0.78f + root_y, left_arm_swing * 0.19f);
    set_joint(out, DEPHY_JOINT_LEFT_RING_0, left_grip * 0.62f, 0.0f, -0.05f, root_x - 0.53f, 0.86f + root_y, left_arm_swing * 0.18f);
    set_joint(out, DEPHY_JOINT_LEFT_RING_1, left_grip * 0.92f, 0.0f, -0.06f, root_x - 0.52f, 0.8f + root_y, left_arm_swing * 0.19f);
    set_joint(out, DEPHY_JOINT_LEFT_PINKY_0, left_grip * 0.65f, 0.0f, -0.1f, root_x - 0.51f, 0.88f + root_y, left_arm_swing * 0.18f);
    set_joint(out, DEPHY_JOINT_LEFT_PINKY_1, left_grip * 0.95f, 0.0f, -0.12f, root_x - 0.49f, 0.83f + root_y, left_arm_swing * 0.19f);
    set_joint(out, DEPHY_JOINT_RIGHT_THUMB_0, right_grip * 0.45f, -wrist_twist * 0.2f, -0.25f, root_x + 0.61f, 0.93f + root_y, right_arm_swing * 0.17f);
    set_joint(out, DEPHY_JOINT_RIGHT_THUMB_1, right_grip * 0.7f, -wrist_twist * 0.2f, -0.35f, root_x + 0.65f, 0.88f + root_y, right_arm_swing * 0.2f);
    set_joint(out, DEPHY_JOINT_RIGHT_INDEX_0, right_grip * 0.55f, 0.0f, -0.05f, root_x + 0.57f, 0.86f + root_y, right_arm_swing * 0.18f);
    set_joint(out, DEPHY_JOINT_RIGHT_INDEX_1, right_grip * 0.85f, 0.0f, -0.06f, root_x + 0.58f, 0.8f + root_y, right_arm_swing * 0.19f);
    set_joint(out, DEPHY_JOINT_RIGHT_MIDDLE_0, right_grip * 0.6f, 0.0f, 0.0f, root_x + 0.55f, 0.85f + root_y, right_arm_swing * 0.18f);
    set_joint(out, DEPHY_JOINT_RIGHT_MIDDLE_1, right_grip * 0.9f, 0.0f, 0.0f, root_x + 0.55f, 0.78f + root_y, right_arm_swing * 0.19f);
    set_joint(out, DEPHY_JOINT_RIGHT_RING_0, right_grip * 0.62f, 0.0f, 0.05f, root_x + 0.53f, 0.86f + root_y, right_arm_swing * 0.18f);
    set_joint(out, DEPHY_JOINT_RIGHT_RING_1, right_grip * 0.92f, 0.0f, 0.06f, root_x + 0.52f, 0.8f + root_y, right_arm_swing * 0.19f);
    set_joint(out, DEPHY_JOINT_RIGHT_PINKY_0, right_grip * 0.65f, 0.0f, 0.1f, root_x + 0.51f, 0.88f + root_y, right_arm_swing * 0.18f);
    set_joint(out, DEPHY_JOINT_RIGHT_PINKY_1, right_grip * 0.95f, 0.0f, 0.12f, root_x + 0.49f, 0.83f + root_y, right_arm_swing * 0.19f);
    set_joint(out, DEPHY_JOINT_LEFT_HEEL, -left_pressure * 0.2f, 0.0f, 0.0f, root_x - 0.3f - counter * stride * 0.25f, 0.02f, left_leg_swing * 0.16f - 0.08f);
    set_joint(out, DEPHY_JOINT_LEFT_TOE, toe_curl * 0.35f - ankle_push * 0.1f, 0.0f, 0.0f, root_x - 0.28f - counter * stride * 0.35f, 0.03f, left_leg_swing * 0.25f + 0.12f);
    set_joint(out, DEPHY_JOINT_RIGHT_HEEL, -right_pressure * 0.2f, 0.0f, 0.0f, root_x + 0.3f - swing * stride * 0.25f, 0.02f, right_leg_swing * 0.16f - 0.08f);
    set_joint(out, DEPHY_JOINT_RIGHT_TOE, toe_curl * 0.35f - ankle_push * 0.1f, 0.0f, 0.0f, root_x + 0.28f - swing * stride * 0.35f, 0.03f, right_leg_swing * 0.25f + 0.12f);
    set_joint(out, DEPHY_JOINT_LEFT_SCAPULA, left_arm_swing * 0.18f, yaw * 0.1f, shoulder_roll * 0.12f, root_x - 0.25f, 1.62f + root_y, -0.08f);
    set_joint(out, DEPHY_JOINT_RIGHT_SCAPULA, right_arm_swing * 0.18f, yaw * 0.1f, -shoulder_roll * 0.12f, root_x + 0.25f, 1.62f + root_y, -0.08f);
    set_joint(out, DEPHY_JOINT_LEFT_FOREARM_TWIST, left_arm_swing * 0.25f, wrist_twist * 0.55f, 0.0f, root_x - 0.53f, 1.1f + root_y, left_arm_swing * 0.11f);
    set_joint(out, DEPHY_JOINT_RIGHT_FOREARM_TWIST, right_arm_swing * 0.25f, -wrist_twist * 0.55f, 0.0f, root_x + 0.53f, 1.1f + root_y, right_arm_swing * 0.11f);
}

size_t dephy_joint_predict_interval(const dephy_joint_predictor_config_t *config,
                                    const dephy_io_motion_sample_t *a,
                                    const dephy_io_motion_sample_t *b,
                                    dephy_joint_frame_t *out,
                                    size_t out_count)
{
    dephy_joint_predictor_config_t local_config;
    uint32_t t_ms;
    size_t count = 0;

    if (!a || !b || !out || out_count == 0) {
        return 0;
    }

    local_config = config ? *config : dephy_joint_predictor_default_config();
    if (local_config.render_period_ms == 0) {
        local_config.render_period_ms = 16;
    }

    for (t_ms = a->t_ms; t_ms <= b->t_ms && count < out_count; t_ms += local_config.render_period_ms) {
        dephy_joint_predict_frame(&local_config, a, b, t_ms, &out[count]);
        ++count;
        if (b->t_ms - t_ms < local_config.render_period_ms) {
            break;
        }
    }

    if (count < out_count && (count == 0 || out[count - 1].frame_t_ms != b->t_ms)) {
        dephy_joint_predict_frame(&local_config, a, b, b->t_ms, &out[count]);
        ++count;
    }

    return count;
}

void dephy_joint_residual_learner_init(dephy_joint_residual_learner_t *learner)
{
    if (!learner) {
        return;
    }

    memset(learner, 0, sizeof(*learner));
}

void dephy_joint_residual_learner_observe(dephy_joint_residual_learner_t *learner,
                                          const dephy_joint_frame_t *predicted,
                                          const dephy_joint_frame_t *target)
{
    size_t joint;
    const float alpha = 0.18f;

    if (!learner || !predicted || !target) {
        return;
    }

    for (joint = 0; joint < DEPHY_JOINT_COUNT; ++joint) {
        float residual[6];
        residual[0] = target->joints[joint].rx - predicted->joints[joint].rx;
        residual[1] = target->joints[joint].ry - predicted->joints[joint].ry;
        residual[2] = target->joints[joint].rz - predicted->joints[joint].rz;
        residual[3] = target->joints[joint].px - predicted->joints[joint].px;
        residual[4] = target->joints[joint].py - predicted->joints[joint].py;
        residual[5] = target->joints[joint].pz - predicted->joints[joint].pz;

        learner->pose_residual[joint][0] = lerp_f32(learner->pose_residual[joint][0], residual[0], alpha);
        learner->pose_residual[joint][1] = lerp_f32(learner->pose_residual[joint][1], residual[1], alpha);
        learner->pose_residual[joint][2] = lerp_f32(learner->pose_residual[joint][2], residual[2], alpha);
        learner->pose_residual[joint][3] = lerp_f32(learner->pose_residual[joint][3], residual[3], alpha);
        learner->pose_residual[joint][4] = lerp_f32(learner->pose_residual[joint][4], residual[4], alpha);
        learner->pose_residual[joint][5] = lerp_f32(learner->pose_residual[joint][5], residual[5], alpha);
    }

    if (learner->confidence_boost < 0.25f) {
        learner->confidence_boost += 0.02f;
    }
    learner->observations += 1;
}

void dephy_joint_residual_learner_apply(const dephy_joint_residual_learner_t *learner,
                                        dephy_joint_frame_t *frame)
{
    size_t joint;

    if (!learner || !frame) {
        return;
    }

    for (joint = 0; joint < DEPHY_JOINT_COUNT; ++joint) {
        frame->joints[joint].rx += learner->pose_residual[joint][0];
        frame->joints[joint].ry += learner->pose_residual[joint][1];
        frame->joints[joint].rz += learner->pose_residual[joint][2];
        frame->joints[joint].px += learner->pose_residual[joint][3];
        frame->joints[joint].py += learner->pose_residual[joint][4];
        frame->joints[joint].pz += learner->pose_residual[joint][5];
    }
    frame->confidence = clamp_f32(frame->confidence + learner->confidence_boost, 0.0f, 1.0f);
}
