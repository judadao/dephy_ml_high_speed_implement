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
        }
    } else if (event->kind == DEPHY_IO_KIND_RELAY) {
        if (event->channel == 1) {
            sample->relay_lock = event->value > 0.0f ? 1.0f : 0.0f;
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
    lock_gate = lerp_f32(a->relay_lock, b->relay_lock, t);
    speed = lerp_f32(a->speed_target, b->speed_target, t) * run_gate * (1.0f - lock_gate);
    speed = clamp_f32(speed, 0.0f, local_config.max_speed);
    stride = clamp_f32(lerp_f32(a->stride_amplitude, b->stride_amplitude, t), 0.0f, 2.0f);
    arm_drive = clamp_f32(lerp_f32(a->arm_drive, b->arm_drive, t), 0.0f, 2.0f);
    leg_drive = clamp_f32(lerp_f32(a->leg_drive, b->leg_drive, t), 0.0f, 2.0f);
    turn = clamp_f32(lerp_f32(a->turn_right - a->turn_left,
                              b->turn_right - b->turn_left,
                              t), -1.0f, 1.0f);

    phase = ((float)frame_t_ms / 300.0f) * speed;
    phase -= floorf(phase);
    swing = sinf(phase * 2.0f * (float)M_PI);
    counter = sinf(phase * 2.0f * (float)M_PI + (float)M_PI);
    root_x = speed * ((float)frame_t_ms / 1000.0f);
    root_y = fabsf(cosf(phase * 2.0f * (float)M_PI)) * 0.05f * speed;
    yaw = turn * 0.45f;

    out->confidence = lock_gate > 0.5f ? 1.0f : local_config.fallback_confidence + 0.2f * run_gate;

    set_joint(out, DEPHY_JOINT_ROOT, 0.0f, yaw, 0.0f, root_x, root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_PELVIS, 0.08f * swing, yaw * 0.4f, 0.0f, root_x, 0.9f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_SPINE_0, -0.06f * swing, yaw * 0.25f, 0.0f, root_x, 1.25f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_SPINE_1, -0.08f * swing, yaw * 0.2f, 0.0f, root_x, 1.55f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_NECK, 0.03f * counter, yaw * 0.15f, 0.0f, root_x, 1.9f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_HEAD, 0.02f * counter, yaw * 0.1f, 0.0f, root_x, 2.15f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_LEFT_SHOULDER, swing * arm_drive * 0.8f, yaw, 0.18f, root_x - 0.32f, 1.65f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_LEFT_ELBOW, swing * arm_drive * 0.55f + 0.45f, 0.0f, 0.0f, root_x - 0.5f, 1.28f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_LEFT_WRIST, swing * arm_drive * 0.35f, 0.0f, 0.0f, root_x - 0.56f, 0.95f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_RIGHT_SHOULDER, counter * arm_drive * 0.8f, yaw, -0.18f, root_x + 0.32f, 1.65f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_RIGHT_ELBOW, counter * arm_drive * 0.55f + 0.45f, 0.0f, 0.0f, root_x + 0.5f, 1.28f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_RIGHT_WRIST, counter * arm_drive * 0.35f, 0.0f, 0.0f, root_x + 0.56f, 0.95f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_LEFT_HIP, counter * leg_drive * stride * 0.75f, yaw * 0.3f, 0.0f, root_x - 0.16f, 0.9f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_LEFT_KNEE, fabsf(counter) * leg_drive * stride * 0.95f, 0.0f, 0.0f, root_x - 0.22f, 0.48f, 0.0f);
    set_joint(out, DEPHY_JOINT_LEFT_ANKLE, -fabsf(counter) * 0.45f, 0.0f, 0.0f, root_x - 0.28f - counter * stride * 0.28f, 0.05f, 0.0f);
    set_joint(out, DEPHY_JOINT_RIGHT_HIP, swing * leg_drive * stride * 0.75f, yaw * 0.3f, 0.0f, root_x + 0.16f, 0.9f + root_y, 0.0f);
    set_joint(out, DEPHY_JOINT_RIGHT_KNEE, fabsf(swing) * leg_drive * stride * 0.95f, 0.0f, 0.0f, root_x + 0.22f, 0.48f, 0.0f);
    set_joint(out, DEPHY_JOINT_RIGHT_ANKLE, -fabsf(swing) * 0.45f, 0.0f, 0.0f, root_x + 0.28f - swing * stride * 0.28f, 0.05f, 0.0f);
    set_joint(out, DEPHY_JOINT_CENTER_MASS, 0.0f, yaw, 0.0f, root_x, 1.2f + root_y, 0.0f);
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
