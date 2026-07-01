#ifndef DEPHY_ML_HIGH_SPEED_IMPLEMENT_JOINT_PREDICTOR_H
#define DEPHY_ML_HIGH_SPEED_IMPLEMENT_JOINT_PREDICTOR_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

#define DEPHY_JOINT_COUNT 55
#define DEPHY_IO_FEATURE_COUNT 32

typedef enum {
    DEPHY_JOINT_ROOT = 0,
    DEPHY_JOINT_PELVIS,
    DEPHY_JOINT_SPINE_0,
    DEPHY_JOINT_SPINE_1,
    DEPHY_JOINT_NECK,
    DEPHY_JOINT_HEAD,
    DEPHY_JOINT_LEFT_SHOULDER,
    DEPHY_JOINT_LEFT_ELBOW,
    DEPHY_JOINT_LEFT_WRIST,
    DEPHY_JOINT_RIGHT_SHOULDER,
    DEPHY_JOINT_RIGHT_ELBOW,
    DEPHY_JOINT_RIGHT_WRIST,
    DEPHY_JOINT_LEFT_HIP,
    DEPHY_JOINT_LEFT_KNEE,
    DEPHY_JOINT_LEFT_ANKLE,
    DEPHY_JOINT_RIGHT_HIP,
    DEPHY_JOINT_RIGHT_KNEE,
    DEPHY_JOINT_RIGHT_ANKLE,
    DEPHY_JOINT_CENTER_MASS,
    DEPHY_JOINT_SPINE_2,
    DEPHY_JOINT_LEFT_CLAVICLE,
    DEPHY_JOINT_RIGHT_CLAVICLE,
    DEPHY_JOINT_JAW,
    DEPHY_JOINT_LEFT_EYE,
    DEPHY_JOINT_RIGHT_EYE,
    DEPHY_JOINT_LEFT_THUMB_0,
    DEPHY_JOINT_LEFT_THUMB_1,
    DEPHY_JOINT_LEFT_INDEX_0,
    DEPHY_JOINT_LEFT_INDEX_1,
    DEPHY_JOINT_LEFT_MIDDLE_0,
    DEPHY_JOINT_LEFT_MIDDLE_1,
    DEPHY_JOINT_LEFT_RING_0,
    DEPHY_JOINT_LEFT_RING_1,
    DEPHY_JOINT_LEFT_PINKY_0,
    DEPHY_JOINT_LEFT_PINKY_1,
    DEPHY_JOINT_RIGHT_THUMB_0,
    DEPHY_JOINT_RIGHT_THUMB_1,
    DEPHY_JOINT_RIGHT_INDEX_0,
    DEPHY_JOINT_RIGHT_INDEX_1,
    DEPHY_JOINT_RIGHT_MIDDLE_0,
    DEPHY_JOINT_RIGHT_MIDDLE_1,
    DEPHY_JOINT_RIGHT_RING_0,
    DEPHY_JOINT_RIGHT_RING_1,
    DEPHY_JOINT_RIGHT_PINKY_0,
    DEPHY_JOINT_RIGHT_PINKY_1,
    DEPHY_JOINT_LEFT_HEEL,
    DEPHY_JOINT_LEFT_TOE,
    DEPHY_JOINT_RIGHT_HEEL,
    DEPHY_JOINT_RIGHT_TOE,
    DEPHY_JOINT_LEFT_SCAPULA,
    DEPHY_JOINT_RIGHT_SCAPULA,
    DEPHY_JOINT_LEFT_FOREARM_TWIST,
    DEPHY_JOINT_RIGHT_FOREARM_TWIST,
} dephy_joint_id_t;

typedef struct {
    float rx;
    float ry;
    float rz;
    float px;
    float py;
    float pz;
} dephy_joint_pose_t;

typedef struct {
    uint32_t frame_t_ms;
    float confidence;
    dephy_joint_pose_t joints[DEPHY_JOINT_COUNT];
} dephy_joint_frame_t;

typedef struct {
    uint32_t t_ms;
    float run_enable;
    float turn_left;
    float turn_right;
    float speed_target;
    float stride_amplitude;
    float arm_drive;
    float leg_drive;
    float relay_lock;
    float left_arm_enable;
    float right_arm_enable;
    float left_leg_enable;
    float right_leg_enable;
    float left_hand_grip;
    float right_hand_grip;
    float left_foot_pressure;
    float right_foot_pressure;
    float torso_pitch;
    float head_yaw;
    float balance_x;
    float balance_z;
    float cadence_target;
    float knee_lift;
    float ankle_push;
    float shoulder_roll;
    float elbow_bend;
    float wrist_twist;
    float hip_sway;
    float spine_twist;
    float toe_curl;
    float prediction_aggression;
    float observed_error;
    float safety_hold;
} dephy_io_motion_sample_t;

typedef struct {
    uint32_t render_period_ms;
    uint32_t io_period_ms;
    float max_speed;
    float fallback_confidence;
} dephy_joint_predictor_config_t;

typedef enum {
    DEPHY_IO_KIND_DI = 0,
    DEPHY_IO_KIND_DO,
    DEPHY_IO_KIND_AI,
    DEPHY_IO_KIND_AO,
    DEPHY_IO_KIND_RELAY,
} dephy_io_kind_t;

typedef struct {
    uint8_t slot;
    dephy_io_kind_t kind;
    uint16_t channel;
    float value;
} dephy_io_event_t;

typedef struct {
    float pose_residual[DEPHY_JOINT_COUNT][6];
    float confidence_boost;
    uint32_t observations;
} dephy_joint_residual_learner_t;

const char *dephy_joint_name(dephy_joint_id_t joint);
dephy_joint_predictor_config_t dephy_joint_predictor_default_config(void);
dephy_io_motion_sample_t dephy_io_motion_sample_default(uint32_t t_ms);
int dephy_io_motion_sample_apply_event(dephy_io_motion_sample_t *sample,
                                       const dephy_io_event_t *event);
void dephy_joint_predict_frame(const dephy_joint_predictor_config_t *config,
                               const dephy_io_motion_sample_t *a,
                               const dephy_io_motion_sample_t *b,
                               uint32_t frame_t_ms,
                               dephy_joint_frame_t *out);
size_t dephy_joint_predict_interval(const dephy_joint_predictor_config_t *config,
                                    const dephy_io_motion_sample_t *a,
                                    const dephy_io_motion_sample_t *b,
                                    dephy_joint_frame_t *out,
                                    size_t out_count);
void dephy_joint_residual_learner_init(dephy_joint_residual_learner_t *learner);
void dephy_joint_residual_learner_observe(dephy_joint_residual_learner_t *learner,
                                          const dephy_joint_frame_t *predicted,
                                          const dephy_joint_frame_t *target);
void dephy_joint_residual_learner_apply(const dephy_joint_residual_learner_t *learner,
                                        dephy_joint_frame_t *frame);

#ifdef __cplusplus
}
#endif

#endif
