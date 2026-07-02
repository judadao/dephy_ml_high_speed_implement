#ifndef DEPHY_ML_HIGH_SPEED_IMPLEMENT_HAND_PREDICTOR_H
#define DEPHY_ML_HIGH_SPEED_IMPLEMENT_HAND_PREDICTOR_H

#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define DEPHY_HAND_MAX_KEYFRAMES 64

typedef struct {
    char frame_id[32];
    uint32_t t_ms;
    float x;
    float y;
    float z;
    float yaw;
    float pitch;
    float roll;
    float grip;
    uint32_t hold_ms;
    float tolerance;
    uint8_t safety_hold;
} dephy_hand_keyframe_t;

typedef struct {
    uint32_t t_ms;
    float x;
    float y;
    float z;
    float yaw;
    float pitch;
    float roll;
    float grip;
    float vx;
    float vy;
    float vz;
    float ax;
    float ay;
    float az;
    float error;
    float confidence;
    uint8_t reached;
} dephy_hand_state_t;

typedef struct {
    uint32_t render_period_ms;
    uint32_t anchor_period_ms;
    float max_speed;
    float max_accel;
    float max_rot_speed;
    float max_grip_speed;
    float kp_pos;
    float kd_pos;
    float kp_rot;
    float kd_rot;
    float kp_grip;
} dephy_hand_predictor_config_t;

dephy_hand_predictor_config_t dephy_hand_predictor_default_config(void);
dephy_hand_state_t dephy_hand_state_from_keyframe(const dephy_hand_keyframe_t *keyframe);
float dephy_hand_state_error_to_keyframe(const dephy_hand_state_t *state,
                                         const dephy_hand_keyframe_t *target);
uint8_t dephy_hand_state_reached_keyframe(const dephy_hand_state_t *state,
                                          const dephy_hand_keyframe_t *target);
void dephy_hand_predict_step(const dephy_hand_predictor_config_t *config,
                             const dephy_hand_state_t *current,
                             const dephy_hand_keyframe_t *target,
                             dephy_hand_state_t *next);

#ifdef __cplusplus
}
#endif

#endif
