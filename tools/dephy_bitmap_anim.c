#include <dephy_ml_high_speed_implement/bitmap_anim.h>

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/stat.h>
#include <sys/types.h>

static int parse_u16(const char *text, uint16_t *out)
{
    char *end = 0;
    long value;

    if (!text || !out) {
        return -1;
    }

    errno = 0;
    value = strtol(text, &end, 10);
    if (errno != 0 || end == text || *end != '\0' || value <= 0 || value > 65535) {
        return -1;
    }

    *out = (uint16_t)value;
    return 0;
}

static int ensure_dir(const char *path)
{
    if (mkdir(path, 0775) == 0) {
        return 0;
    }
    if (errno == EEXIST) {
        return 0;
    }
    return -1;
}

static void usage(const char *argv0)
{
    fprintf(stderr,
            "usage: %s [--out DIR] [--frames N] [--width W] [--height H] [--cycles N]\n",
            argv0);
}

int main(int argc, char **argv)
{
    dephy_animation_config_t config = dephy_animation_default_config();
    dephy_bitmap_frame_t frame;
    const char *out_dir = "build_out/frames";
    char path[512];
    char manifest_path[512];
    FILE *manifest;
    uint16_t i;

    for (i = 1; i < (uint16_t)argc; ++i) {
        if (strcmp(argv[i], "--out") == 0 && i + 1 < argc) {
            out_dir = argv[++i];
        } else if (strcmp(argv[i], "--frames") == 0 && i + 1 < argc) {
            if (parse_u16(argv[++i], &config.frames) != 0) {
                usage(argv[0]);
                return 2;
            }
        } else if (strcmp(argv[i], "--width") == 0 && i + 1 < argc) {
            if (parse_u16(argv[++i], &config.width) != 0) {
                usage(argv[0]);
                return 2;
            }
        } else if (strcmp(argv[i], "--height") == 0 && i + 1 < argc) {
            if (parse_u16(argv[++i], &config.height) != 0) {
                usage(argv[0]);
                return 2;
            }
        } else if (strcmp(argv[i], "--cycles") == 0 && i + 1 < argc) {
            config.cycles = (float)atof(argv[++i]);
            if (config.cycles <= 0.0f) {
                usage(argv[0]);
                return 2;
            }
        } else {
            usage(argv[0]);
            return 2;
        }
    }

    if (ensure_dir(out_dir) != 0) {
        perror(out_dir);
        return 1;
    }

    if (snprintf(manifest_path, sizeof(manifest_path), "%s/manifest.txt", out_dir) >=
        (int)sizeof(manifest_path)) {
        return 1;
    }

    manifest = fopen(manifest_path, "w");
    if (!manifest) {
        perror(manifest_path);
        return 1;
    }

    fprintf(manifest, "format=ppm\nwidth=%u\nheight=%u\nframes=%u\n", config.width, config.height, config.frames);

    if (dephy_bitmap_frame_init(&frame, config.width, config.height) != 0) {
        fclose(manifest);
        return 1;
    }

    for (i = 0; i < config.frames; ++i) {
        dephy_motion_control_t control = dephy_motion_control_for_frame(&config, i);

        dephy_bitmap_frame_clear(&frame, config.background);
        if (dephy_bitmap_render_runner(&frame, &control) != 0) {
            dephy_bitmap_frame_free(&frame);
            fclose(manifest);
            return 1;
        }

        if (snprintf(path, sizeof(path), "%s/frame_%04u.ppm", out_dir, i) >= (int)sizeof(path)) {
            dephy_bitmap_frame_free(&frame);
            fclose(manifest);
            return 1;
        }
        if (dephy_bitmap_write_ppm(&frame, path) != 0) {
            perror(path);
            dephy_bitmap_frame_free(&frame);
            fclose(manifest);
            return 1;
        }
        fprintf(manifest, "frame=%s phase=%.3f\n", path, control.gait_phase);
    }

    dephy_bitmap_frame_free(&frame);
    fclose(manifest);
    printf("generated %u frames in %s\n", config.frames, out_dir);
    return 0;
}

