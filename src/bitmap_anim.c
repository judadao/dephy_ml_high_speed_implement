#include <dephy_ml_high_speed_implement/bitmap_anim.h>

#include <math.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#ifndef M_PI
#define M_PI 3.14159265358979323846
#endif

static int clamp_i32(int value, int min_value, int max_value)
{
    if (value < min_value) {
        return min_value;
    }
    if (value > max_value) {
        return max_value;
    }
    return value;
}

static void put_pixel(dephy_bitmap_frame_t *frame, int x, int y, dephy_bitmap_rgb_t color)
{
    if (!frame || !frame->pixels || x < 0 || y < 0 ||
        x >= (int)frame->width || y >= (int)frame->height) {
        return;
    }

    frame->pixels[(size_t)y * frame->width + (size_t)x] = color;
}

static void draw_disc(dephy_bitmap_frame_t *frame, int cx, int cy, int radius, dephy_bitmap_rgb_t color)
{
    int x;
    int y;

    for (y = -radius; y <= radius; ++y) {
        for (x = -radius; x <= radius; ++x) {
            if (x * x + y * y <= radius * radius) {
                put_pixel(frame, cx + x, cy + y, color);
            }
        }
    }
}

static void draw_line(dephy_bitmap_frame_t *frame,
                      int x0,
                      int y0,
                      int x1,
                      int y1,
                      int thickness,
                      dephy_bitmap_rgb_t color)
{
    int dx = abs(x1 - x0);
    int sx = x0 < x1 ? 1 : -1;
    int dy = -abs(y1 - y0);
    int sy = y0 < y1 ? 1 : -1;
    int err = dx + dy;
    int radius = thickness > 1 ? thickness / 2 : 0;

    for (;;) {
        int e2;

        draw_disc(frame, x0, y0, radius, color);
        if (x0 == x1 && y0 == y1) {
            break;
        }
        e2 = 2 * err;
        if (e2 >= dy) {
            err += dy;
            x0 += sx;
        }
        if (e2 <= dx) {
            err += dx;
            y0 += sy;
        }
    }
}

int dephy_bitmap_frame_init(dephy_bitmap_frame_t *frame, uint16_t width, uint16_t height)
{
    size_t count;

    if (!frame || width == 0 || height == 0) {
        return -1;
    }

    count = (size_t)width * height;
    frame->pixels = (dephy_bitmap_rgb_t *)calloc(count, sizeof(dephy_bitmap_rgb_t));
    if (!frame->pixels) {
        frame->width = 0;
        frame->height = 0;
        return -1;
    }

    frame->width = width;
    frame->height = height;
    return 0;
}

void dephy_bitmap_frame_free(dephy_bitmap_frame_t *frame)
{
    if (!frame) {
        return;
    }

    free(frame->pixels);
    frame->pixels = 0;
    frame->width = 0;
    frame->height = 0;
}

void dephy_bitmap_frame_clear(dephy_bitmap_frame_t *frame, dephy_bitmap_rgb_t color)
{
    size_t i;
    size_t count;

    if (!frame || !frame->pixels) {
        return;
    }

    count = (size_t)frame->width * frame->height;
    for (i = 0; i < count; ++i) {
        frame->pixels[i] = color;
    }
}

int dephy_bitmap_render_runner(dephy_bitmap_frame_t *frame, const dephy_motion_control_t *control)
{
    float phase;
    float arm;
    float leg;
    int cx;
    int cy;
    int ground_y;
    int scale;
    int head_radius;
    int neck_y;
    int hip_y;
    int shoulder_y;
    int left_hand_x;
    int left_hand_y;
    int right_hand_x;
    int right_hand_y;
    int left_foot_x;
    int left_foot_y;
    int right_foot_x;
    int right_foot_y;
    dephy_bitmap_rgb_t shadow = { 30, 36, 44 };

    if (!frame || !frame->pixels || !control) {
        return -1;
    }

    phase = control->gait_phase * 2.0f * (float)M_PI;
    arm = sinf(phase) * control->arm_drive;
    leg = sinf(phase) * control->leg_drive;
    cx = clamp_i32(control->center_x, 0, (int)frame->width - 1);
    cy = clamp_i32(control->center_y, 0, (int)frame->height - 1);
    ground_y = clamp_i32(control->ground_y, 0, (int)frame->height - 1);
    scale = frame->height < 80 ? 1 : 2;
    head_radius = 4 * scale;
    neck_y = cy - 13 * scale;
    shoulder_y = cy - 9 * scale;
    hip_y = cy + 5 * scale;

    left_hand_x = cx - (int)(13.0f * scale + arm * 9.0f * scale);
    left_hand_y = shoulder_y + 9 * scale + (int)(cosf(phase) * 3.0f * scale);
    right_hand_x = cx + (int)(13.0f * scale + arm * 9.0f * scale);
    right_hand_y = shoulder_y + 9 * scale - (int)(cosf(phase) * 3.0f * scale);

    left_foot_x = cx - (int)(8.0f * scale + leg * 15.0f * scale);
    right_foot_x = cx + (int)(8.0f * scale + leg * 15.0f * scale);
    left_foot_y = ground_y - (int)(fabsf(cosf(phase)) * 5.0f * scale);
    right_foot_y = ground_y - (int)(fabsf(cosf(phase + (float)M_PI)) * 5.0f * scale);

    draw_line(frame, 0, ground_y + 1, frame->width - 1, ground_y + 1, 2, shadow);
    draw_disc(frame, cx, cy - 22 * scale, head_radius, control->speed > 0.0f ?
              (dephy_bitmap_rgb_t){ 245, 236, 214 } : (dephy_bitmap_rgb_t){ 180, 190, 204 });
    draw_line(frame, cx, neck_y, cx, hip_y, 3 * scale, (dephy_bitmap_rgb_t){ 230, 238, 248 });
    draw_line(frame, cx - 8 * scale, shoulder_y, cx + 8 * scale, shoulder_y, 2 * scale,
              (dephy_bitmap_rgb_t){ 230, 238, 248 });
    draw_line(frame, cx - 8 * scale, shoulder_y, left_hand_x, left_hand_y, 2 * scale,
              (dephy_bitmap_rgb_t){ 20, 184, 166 });
    draw_line(frame, cx + 8 * scale, shoulder_y, right_hand_x, right_hand_y, 2 * scale,
              (dephy_bitmap_rgb_t){ 20, 184, 166 });
    draw_line(frame, cx, hip_y, left_foot_x, left_foot_y, 2 * scale,
              (dephy_bitmap_rgb_t){ 245, 158, 11 });
    draw_line(frame, cx, hip_y, right_foot_x, right_foot_y, 2 * scale,
              (dephy_bitmap_rgb_t){ 245, 158, 11 });
    draw_line(frame, left_foot_x - 4 * scale, left_foot_y, left_foot_x + 5 * scale, left_foot_y, scale,
              (dephy_bitmap_rgb_t){ 239, 68, 68 });
    draw_line(frame, right_foot_x - 4 * scale, right_foot_y, right_foot_x + 5 * scale, right_foot_y, scale,
              (dephy_bitmap_rgb_t){ 239, 68, 68 });

    return 0;
}

int dephy_bitmap_write_ppm(const dephy_bitmap_frame_t *frame, const char *path)
{
    FILE *fp;
    size_t count;

    if (!frame || !frame->pixels || !path) {
        return -1;
    }

    fp = fopen(path, "wb");
    if (!fp) {
        return -1;
    }

    if (fprintf(fp, "P6\n%u %u\n255\n", frame->width, frame->height) < 0) {
        fclose(fp);
        return -1;
    }

    count = (size_t)frame->width * frame->height;
    if (fwrite(frame->pixels, sizeof(dephy_bitmap_rgb_t), count, fp) != count) {
        fclose(fp);
        return -1;
    }

    fclose(fp);
    return 0;
}

dephy_motion_control_t dephy_motion_control_for_frame(const dephy_animation_config_t *config,
                                                      uint16_t frame_index)
{
    dephy_motion_control_t control;
    float denom = 1.0f;

    memset(&control, 0, sizeof(control));
    if (!config || config->frames == 0) {
        return control;
    }

    if (config->frames > 1) {
        denom = (float)(config->frames - 1);
    }

    control.gait_phase = ((float)frame_index / denom) * config->cycles;
    control.gait_phase -= floorf(control.gait_phase);
    control.speed = 1.0f;
    control.arm_drive = 1.0f;
    control.leg_drive = 1.0f;
    control.ground_y = (int)config->height - 10;
    control.center_x = (int)(config->width / 2);
    control.center_y = (int)(config->height / 2) + 8;
    return control;
}

dephy_animation_config_t dephy_animation_default_config(void)
{
    dephy_animation_config_t config;

    config.width = 128;
    config.height = 96;
    config.frames = 16;
    config.cycles = 1.0f;
    config.background = (dephy_bitmap_rgb_t){ 11, 15, 20 };
    config.body = (dephy_bitmap_rgb_t){ 230, 238, 248 };
    config.accent = (dephy_bitmap_rgb_t){ 20, 184, 166 };
    return config;
}
