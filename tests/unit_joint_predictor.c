#include <dephy_ml_high_speed_implement/joint_predictor.h>

#include <assert.h>
#include <string.h>

static void test_predict_interval_generates_intermediate_frames(void)
{
    dephy_joint_predictor_config_t config = dephy_joint_predictor_default_config();
    dephy_io_motion_sample_t a = dephy_io_motion_sample_default(0);
    dephy_io_motion_sample_t b = dephy_io_motion_sample_default(300);
    dephy_joint_frame_t frames[32];
    size_t count;

    config.render_period_ms = 16;
    a.speed_target = 1.0f;
    b.speed_target = 1.4f;
    count = dephy_joint_predict_interval(&config, &a, &b, frames, sizeof(frames) / sizeof(frames[0]));

    assert(count >= 19);
    assert(frames[0].frame_t_ms == 0);
    assert(frames[count - 1].frame_t_ms == 300);
    assert(frames[3].joints[DEPHY_JOINT_LEFT_KNEE].rx != frames[4].joints[DEPHY_JOINT_LEFT_KNEE].rx);
}

static void test_turn_changes_root_yaw(void)
{
    dephy_joint_predictor_config_t config = dephy_joint_predictor_default_config();
    dephy_io_motion_sample_t a = dephy_io_motion_sample_default(0);
    dephy_io_motion_sample_t b = dephy_io_motion_sample_default(300);
    dephy_joint_frame_t frame;

    a.turn_left = 1.0f;
    b.turn_left = 1.0f;
    dephy_joint_predict_frame(&config, &a, &b, 150, &frame);
    assert(frame.joints[DEPHY_JOINT_ROOT].ry < 0.0f);

    a.turn_left = 0.0f;
    b.turn_left = 0.0f;
    a.turn_right = 1.0f;
    b.turn_right = 1.0f;
    dephy_joint_predict_frame(&config, &a, &b, 150, &frame);
    assert(frame.joints[DEPHY_JOINT_ROOT].ry > 0.0f);
}

static void test_joint_names_are_stable(void)
{
    assert(strcmp(dephy_joint_name(DEPHY_JOINT_LEFT_ANKLE), "left_ankle") == 0);
    assert(strcmp(dephy_joint_name(DEPHY_JOINT_RIGHT_WRIST), "right_wrist") == 0);
}

static void test_io_events_map_to_motion_sample(void)
{
    dephy_io_motion_sample_t sample = dephy_io_motion_sample_default(0);
    dephy_io_event_t event;

    memset(&event, 0, sizeof(event));
    event.slot = 1;
    event.kind = DEPHY_IO_KIND_AI;
    event.channel = 1;
    event.value = 50.0f;
    assert(dephy_io_motion_sample_apply_event(&sample, &event) == 0);
    assert(sample.speed_target > 1.49f);
    assert(sample.speed_target < 1.51f);

    event.kind = DEPHY_IO_KIND_DI;
    event.channel = 2;
    event.value = 1.0f;
    assert(dephy_io_motion_sample_apply_event(&sample, &event) == 0);
    assert(sample.turn_left == 1.0f);
}

static void test_residual_learner_applies_observed_offset(void)
{
    dephy_joint_residual_learner_t learner;
    dephy_joint_frame_t predicted;
    dephy_joint_frame_t target;
    dephy_joint_frame_t adjusted;

    memset(&predicted, 0, sizeof(predicted));
    memset(&target, 0, sizeof(target));
    dephy_joint_residual_learner_init(&learner);

    target.joints[DEPHY_JOINT_LEFT_KNEE].rx = 1.0f;
    dephy_joint_residual_learner_observe(&learner, &predicted, &target);
    adjusted = predicted;
    dephy_joint_residual_learner_apply(&learner, &adjusted);

    assert(learner.observations == 1);
    assert(adjusted.joints[DEPHY_JOINT_LEFT_KNEE].rx > 0.0f);
    assert(adjusted.confidence > predicted.confidence);
}

int main(void)
{
    test_predict_interval_generates_intermediate_frames();
    test_turn_changes_root_yaw();
    test_joint_names_are_stable();
    test_io_events_map_to_motion_sample();
    test_residual_learner_applies_observed_offset();
    return 0;
}
