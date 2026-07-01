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
            "usage: %s [--render-ms 16] [--io-ms 300] [--samples 4] [--turn-left|--turn-right] [--event slot:type:channel:value] [--from-io-stream [FILE]]\n",
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

static int parse_json_number(const char *line, const char *key, float *out)
{
    const char *pos;
    char pattern[48];

    if (!line || !key || !out) {
        return -1;
    }

    if (snprintf(pattern, sizeof(pattern), "\"%s\":", key) >= (int)sizeof(pattern)) {
        return -1;
    }
    pos = strstr(line, pattern);
    if (!pos) {
        return -1;
    }
    pos += strlen(pattern);
    *out = (float)atof(pos);
    return 0;
}

static int parse_json_string(const char *line, const char *key, char *out, size_t out_size)
{
    const char *pos;
    const char *end;
    char pattern[48];
    size_t len;

    if (!line || !key || !out || out_size == 0) {
        return -1;
    }

    if (snprintf(pattern, sizeof(pattern), "\"%s\":\"", key) >= (int)sizeof(pattern)) {
        return -1;
    }
    pos = strstr(line, pattern);
    if (!pos) {
        return -1;
    }
    pos += strlen(pattern);
    end = strchr(pos, '"');
    if (!end) {
        return -1;
    }
    len = (size_t)(end - pos);
    if (len >= out_size) {
        len = out_size - 1;
    }
    memcpy(out, pos, len);
    out[len] = '\0';
    return 0;
}

static int parse_stream_event(const char *line, dephy_io_event_t *event, uint32_t *t_ms)
{
    char kind_text[16];
    float value;

    if (!line || !event || !t_ms) {
        return -1;
    }
    memset(event, 0, sizeof(*event));

    if (parse_json_number(line, "slot", &value) != 0 || value < 1.0f || value > 20.0f) {
        return -1;
    }
    event->slot = (uint8_t)value;
    if (parse_json_string(line, "type", kind_text, sizeof(kind_text)) != 0 ||
        parse_io_kind(kind_text, &event->kind) != 0) {
        return -1;
    }
    if (parse_json_number(line, "channel", &value) != 0 || value < 0.0f || value > 65535.0f) {
        return -1;
    }
    event->channel = (uint16_t)value;
    if (parse_json_number(line, "value", &event->value) != 0) {
        return -1;
    }
    if (parse_json_number(line, "t_ms", &value) != 0 || value < 0.0f) {
        return -1;
    }
    *t_ms = (uint32_t)value;
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

static int replay_io_stream(FILE *input, const dephy_joint_predictor_config_t *config)
{
    char line[512];
    dephy_io_motion_sample_t previous = dephy_io_motion_sample_default(0);
    dephy_io_motion_sample_t current = previous;
    int have_previous = 0;

    printf("frame_t_ms,joint,confidence,rx,ry,rz,px,py,pz\n");
    while (fgets(line, sizeof(line), input)) {
        dephy_io_event_t event;
        uint32_t t_ms;

        if (parse_stream_event(line, &event, &t_ms) != 0) {
            continue;
        }

        current.t_ms = t_ms;
        if (dephy_io_motion_sample_apply_event(&current, &event) != 0) {
            return 1;
        }

        if (have_previous) {
            dephy_joint_frame_t frames[128];
            size_t count = dephy_joint_predict_interval(config,
                                                        &previous,
                                                        &current,
                                                        frames,
                                                        sizeof(frames) / sizeof(frames[0]));
            size_t j;

            for (j = 0; j < count; ++j) {
                if (j == 0) {
                    continue;
                }
                write_frame_csv(&frames[j]);
            }
        }

        previous = current;
        have_previous = 1;
    }

    return have_previous ? 0 : 1;
}

int main(int argc, char **argv)
{
    dephy_joint_predictor_config_t config = dephy_joint_predictor_default_config();
    uint32_t samples = 4;
    dephy_io_event_t events[16];
    size_t event_count = 0;
    const char *stream_path = 0;
    int from_io_stream = 0;
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
        } else if (strcmp(argv[i], "--from-io-stream") == 0) {
            from_io_stream = 1;
            if (i + 1 < argc && argv[i + 1][0] != '-') {
                stream_path = argv[++i];
            }
        } else {
            print_usage(argv[0]);
            return 2;
        }
    }

    if (from_io_stream) {
        FILE *input = stdin;
        int result;

        if (stream_path) {
            input = fopen(stream_path, "r");
            if (!input) {
                perror(stream_path);
                return 1;
            }
        }
        result = replay_io_stream(input, &config);
        if (input != stdin) {
            fclose(input);
        }
        return result;
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
