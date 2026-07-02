#include <dephy_ml_high_speed_implement/hand_predictor.h>

#include <assert.h>
#include <string.h>

static void test_step_reaches_target_without_overshoot(void)
{
    dephy_hand_predictor_config_t config = dephy_hand_predictor_default_config();
    dephy_hand_keyframe_t start;
    dephy_hand_keyframe_t target;
    dephy_hand_state_t state;
    int i;

    memset(&start, 0, sizeof(start));
    memset(&target, 0, sizeof(target));
    start.tolerance = 0.01f;
    target.x = 0.25f;
    target.tolerance = 0.01f;
    state = dephy_hand_state_from_keyframe(&start);
    state.reached = 0;

    for (i = 0; i < 300 && !state.reached; ++i) {
        dephy_hand_state_t next;
        dephy_hand_predict_step(&config, &state, &target, &next);
        assert(next.x <= target.x + 0.0001f);
        state = next;
    }

    assert(dephy_hand_state_reached_keyframe(&state, &target));
}

static void test_safety_hold_freezes_state(void)
{
    dephy_hand_predictor_config_t config = dephy_hand_predictor_default_config();
    dephy_hand_keyframe_t target;
    dephy_hand_state_t state;
    dephy_hand_state_t next;

    memset(&target, 0, sizeof(target));
    memset(&state, 0, sizeof(state));
    state.x = 0.1f;
    state.vx = 1.0f;
    target.x = 1.0f;
    target.safety_hold = 1;
    dephy_hand_predict_step(&config, &state, &target, &next);

    assert(next.x == state.x);
    assert(next.vx == 0.0f);
    assert(next.confidence == 1.0f);
}

static void test_grip_and_rotation_approach_target(void)
{
    dephy_hand_predictor_config_t config = dephy_hand_predictor_default_config();
    dephy_hand_keyframe_t target;
    dephy_hand_state_t state;
    dephy_hand_state_t next;

    memset(&target, 0, sizeof(target));
    memset(&state, 0, sizeof(state));
    target.yaw = 0.5f;
    target.grip = 1.0f;
    target.tolerance = 0.01f;
    dephy_hand_predict_step(&config, &state, &target, &next);

    assert(next.yaw > state.yaw);
    assert(next.grip > state.grip);
}

int main(void)
{
    test_step_reaches_target_without_overshoot();
    test_safety_hold_freezes_state();
    test_grip_and_rotation_approach_target();
    return 0;
}
