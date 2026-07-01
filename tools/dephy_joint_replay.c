#include <dephy_ml_high_speed_implement/joint_predictor.h>

#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int parse_arg_u32(const char *text, uint32_t *out)
{
    char *end = 0;
    unsigned long value;

    if (!text || !out) {
        return -1;
    }

    value = strtoul(text, &end, 10);
    if (end == text || *end != '\0' || value > 1000000UL) {
        return -1;
    }

    *out = (uint32_t)value;
    return 0;
}

static void print_usage(const char *argv0)
{
    fprintf(stderr,
            "usage: %s [--render-ms 16] [--io-ms 300] [--samples 4] [--turn-left|--turn-right] [--event slot:type:channel:value]\n",
            argv0);
}

static int parse_io_kind(const char *text, dephy_io_kind_t *kind)
{
    if (strcmp(text, "di") == 0 || strcmp(text, "DI") == 0) {
        *kind = DEPHY_IO_KIND_DI;
    } else if (strcmp(text, "do") == 0 || strcmp(text, "DO") == 0) {
        *kind = DEPHY_IO_KIND_DO;
    } else if (strcmp(text, "ai") == 0 || strcmp(text, "AI") == 0) {
        *kind = DEPHY_IO_KIND_AI;
    } else if (strcmp(text, "ao") == 0 || strcmp(text, "AO") == 0) {
        *kind = DEPHY_IO_KIND_AO;
    } else if (strcmp(text, "relay") == 0 || strcmp(text, "RELAY") == 0) {
        *kind = DEPHY_IO_KIND_RELAY;
    } else {
        return -1;
    }
    return 0;
}

static int parse_event(char *text, dephy_io_event_t *event)
{
    char *slot_text;
    char *kind_text;
    char *channel_text;
    char *value_text;
    uint32_t parsed;

    if (!text || !event) {
        return -1;
    }

    slot_text = strtok(text, ":");
    kind_text = strtok(0, ":");
    channel_text = strtok(0, ":");
    value_text = strtok(0, ":");
    if (!slot_text || !kind_text || !channel_text || !value_text || strtok(0, ":")) {
        return -1;
    }
    if (parse_arg_u32(slot_text, &parsed) != 0 || parsed == 0 || parsed > 20) {
        return -1;
    }
    event->slot = (uint8_t)parsed;
    if (parse_io_kind(kind_text, &event->kind) != 0) {
        return -1;
    }
    if (parse_arg_u32(channel_text, &parsed) != 0 || parsed > 65535) {
        return -1;
    }
    event->channel = (uint16_t)parsed;
    event->value = (float)atof(value_text);
    return 0;
}

static void write_frame_csv(const dephy_joint_frame_t *frame)
{
    int i;

    for (i = 0; i < DEPHY_JOINT_COUNT; ++i) {
        printf("%u,%s,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f,%.3f\n",
               frame->frame_t_ms,
               dephy_joint_name((dephy_joint_id_t)i),
               frame->confidence,
               frame->joints[i].rx,
               frame->joints[i].ry,
               frame->joints[i].rz,
               frame->joints[i].px,
               frame->joints[i].py,
               frame->joints[i].pz);
    }
}

int main(int argc, char **argv)
{
    dephy_joint_predictor_config_t config = dephy_joint_predictor_default_config();
    uint32_t samples = 4;
    dephy_io_event_t events[16];
    size_t event_count = 0;
    int turn_left = 0;
    int turn_right = 0;
    int i;

    for (i = 1; i < argc; ++i) {
        if (strcmp(argv[i], "--render-ms") == 0 && i + 1 < argc) {
            if (parse_arg_u32(argv[++i], &config.render_period_ms) != 0 || config.render_period_ms == 0) {
                print_usage(argv[0]);
                return 2;
            }
        } else if (strcmp(argv[i], "--io-ms") == 0 && i + 1 < argc) {
            if (parse_arg_u32(argv[++i], &config.io_period_ms) != 0 || config.io_period_ms == 0) {
                print_usage(argv[0]);
                return 2;
            }
        } else if (strcmp(argv[i], "--samples") == 0 && i + 1 < argc) {
            if (parse_arg_u32(argv[++i], &samples) != 0 || samples < 2) {
                print_usage(argv[0]);
                return 2;
            }
        } else if (strcmp(argv[i], "--turn-left") == 0) {
            turn_left = 1;
        } else if (strcmp(argv[i], "--turn-right") == 0) {
            turn_right = 1;
        } else if (strcmp(argv[i], "--event") == 0 && i + 1 < argc && event_count < sizeof(events) / sizeof(events[0])) {
            if (parse_event(argv[++i], &events[event_count]) != 0) {
                print_usage(argv[0]);
                return 2;
            }
            ++event_count;
        } else {
            print_usage(argv[0]);
            return 2;
        }
    }

    printf("frame_t_ms,joint,confidence,rx,ry,rz,px,py,pz\n");
    for (i = 0; i < (int)samples - 1; ++i) {
        dephy_io_motion_sample_t a = dephy_io_motion_sample_default((uint32_t)i * config.io_period_ms);
        dephy_io_motion_sample_t b = dephy_io_motion_sample_default((uint32_t)(i + 1) * config.io_period_ms);
        dephy_joint_frame_t frames[64];
        size_t count;
        size_t j;
        size_t e;

        a.speed_target = 0.7f + 0.2f * (float)i;
        b.speed_target = 0.7f + 0.2f * (float)(i + 1);
        a.stride_amplitude = 0.8f + 0.1f * (float)i;
        b.stride_amplitude = 0.8f + 0.1f * (float)(i + 1);
        a.turn_left = turn_left ? 1.0f : 0.0f;
        b.turn_left = turn_left ? 1.0f : 0.0f;
        a.turn_right = turn_right ? 1.0f : 0.0f;
        b.turn_right = turn_right ? 1.0f : 0.0f;

        for (e = 0; e < event_count; ++e) {
            if (dephy_io_motion_sample_apply_event(&a, &events[e]) != 0 ||
                dephy_io_motion_sample_apply_event(&b, &events[e]) != 0) {
                return 1;
            }
        }

        count = dephy_joint_predict_interval(&config, &a, &b, frames, sizeof(frames) / sizeof(frames[0]));
        for (j = 0; j < count; ++j) {
            if (i > 0 && j == 0) {
                continue;
            }
            write_frame_csv(&frames[j]);
        }
    }

    return 0;
}
