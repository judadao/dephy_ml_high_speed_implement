#ifndef DEPHY_ML_HIGH_SPEED_IMPLEMENT_BITMAP_ANIM_H
#define DEPHY_ML_HIGH_SPEED_IMPLEMENT_BITMAP_ANIM_H

#include <stddef.h>
#include <stdint.h>

#ifdef __cplusplus
extern "C" {
#endif

typedef struct {
    uint8_t r;
    uint8_t g;
    uint8_t b;
} dephy_bitmap_rgb_t;

typedef struct {
    uint16_t width;
    uint16_t height;
    dephy_bitmap_rgb_t *pixels;
} dephy_bitmap_frame_t;

typedef struct {
    float gait_phase;
    float speed;
    float arm_drive;
    float leg_drive;
    int ground_y;
    int center_x;
    int center_y;
} dephy_motion_control_t;

typedef struct {
    uint16_t width;
    uint16_t height;
    uint16_t frames;
    float cycles;
    dephy_bitmap_rgb_t background;
    dephy_bitmap_rgb_t body;
    dephy_bitmap_rgb_t accent;
} dephy_animation_config_t;

int dephy_bitmap_frame_init(dephy_bitmap_frame_t *frame, uint16_t width, uint16_t height);
void dephy_bitmap_frame_free(dephy_bitmap_frame_t *frame);
void dephy_bitmap_frame_clear(dephy_bitmap_frame_t *frame, dephy_bitmap_rgb_t color);
int dephy_bitmap_render_runner(dephy_bitmap_frame_t *frame, const dephy_motion_control_t *control);
int dephy_bitmap_write_ppm(const dephy_bitmap_frame_t *frame, const char *path);
dephy_motion_control_t dephy_motion_control_for_frame(const dephy_animation_config_t *config,
                                                      uint16_t frame_index);
dephy_animation_config_t dephy_animation_default_config(void);

#ifdef __cplusplus
}
#endif

#endif

