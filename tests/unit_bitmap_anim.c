#include <dephy_ml_high_speed_implement/bitmap_anim.h>

#include <assert.h>
#include <stddef.h>

static size_t count_lit_pixels(const dephy_bitmap_frame_t *frame)
{
    size_t i;
    size_t count = 0;
    size_t total = (size_t)frame->width * frame->height;

    for (i = 0; i < total; ++i) {
        dephy_bitmap_rgb_t px = frame->pixels[i];
        if (px.r != 0 || px.g != 0 || px.b != 0) {
            ++count;
        }
    }

    return count;
}

static void test_render_runner_sets_pixels(void)
{
    dephy_bitmap_frame_t frame;
    dephy_animation_config_t config = dephy_animation_default_config();
    dephy_motion_control_t control = dephy_motion_control_for_frame(&config, 3);

    assert(dephy_bitmap_frame_init(&frame, 96, 72) == 0);
    dephy_bitmap_frame_clear(&frame, (dephy_bitmap_rgb_t){ 0, 0, 0 });
    assert(dephy_bitmap_render_runner(&frame, &control) == 0);
    assert(count_lit_pixels(&frame) > 100);
    dephy_bitmap_frame_free(&frame);
}

static void test_motion_control_phase_wraps(void)
{
    dephy_animation_config_t config = dephy_animation_default_config();
    dephy_motion_control_t control;

    config.frames = 8;
    config.cycles = 2.0f;
    control = dephy_motion_control_for_frame(&config, 7);
    assert(control.gait_phase >= 0.0f);
    assert(control.gait_phase < 1.0f);
}

static void test_indexed_matrix_quantizes_pixels(void)
{
    dephy_bitmap_frame_t frame;
    dephy_indexed_frame_t indexed;
    dephy_bitmap_rgb_t palette[] = {
        { 0, 0, 0 },
        { 255, 255, 255 },
    };

    assert(dephy_bitmap_frame_init(&frame, 4, 4) == 0);
    assert(dephy_indexed_frame_init(&indexed, 4, 4) == 0);
    dephy_bitmap_frame_clear(&frame, (dephy_bitmap_rgb_t){ 250, 250, 250 });
    assert(dephy_bitmap_to_indexed_matrix(&frame, &indexed, palette, 2) == 0);
    assert(indexed.indices[0] == 1);
    dephy_indexed_frame_free(&indexed);
    dephy_bitmap_frame_free(&frame);
}

int main(void)
{
    test_render_runner_sets_pixels();
    test_motion_control_phase_wraps();
    test_indexed_matrix_quantizes_pixels();
    return 0;
}
