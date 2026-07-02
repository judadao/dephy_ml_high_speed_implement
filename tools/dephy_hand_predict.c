#include <dephy_ml_high_speed_implement/hand_predictor.h>

#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

static int parse_u32(const char *text, uint32_t *out)
{
    char *end = 0;
    unsigned long value;

    if (!text || !out) {
        return -1;
    }

    errno = 0;
    value = strtoul(text, &end, 10);
    if (errno != 0 || end == text || (*end != '\0' && *end != '\n' && *end != '\r') ||
        value > 1000000UL) {
        return -1;
    }
    *out = (uint32_t)value;
    return 0;
}

static int parse_f32(const char *text, float *out)
{
    char *end = 0;
    float value;

    if (!text || !out) {
        return -1;
    }

    errno = 0;
    value = strtof(text, &end);
    if (errno != 0 || end == text || (*end != '\0' && *end != '\n' && *end != '\r')) {
        return -1;
    }
    *out = value;
    return 0;
}

static void usage(const char *argv0)
{
    fprintf(stderr,
            "usage: %s (--keyframes FILE|--from-hand-stream FILE) [--observed-input] [--policy FILE] [--result FILE] [--render-ms 16] [--max-speed N] [--max-accel N]\n",
            argv0);
}

static int read_file_text(const char *path, char *out, size_t out_size)
{
    FILE *fp;
    size_t count;

    if (!path || !out || out_size == 0) {
        return -1;
    }

    fp = fopen(path, "rb");
    if (!fp) {
        perror(path);
        return -1;
    }
    count = fread(out, 1, out_size - 1, fp);
    out[count] = '\0';
    fclose(fp);
    return 0;
}

static int json_find_f32(const char *json, const char *key, float *out)
{
    char pattern[64];
    const char *pos;
    char *end = 0;

    if (!json || !key || !out) {
        return -1;
    }
    if (snprintf(pattern, sizeof(pattern), "\"%s\":", key) >= (int)sizeof(pattern)) {
        return -1;
    }
    pos = strstr(json, pattern);
    if (!pos) {
        return -1;
    }
    pos += strlen(pattern);
    errno = 0;
    *out = strtof(pos, &end);
    if (errno != 0 || end == pos) {
        return -1;
    }
    return 0;
}

static int load_policy_config(const char *path, dephy_hand_predictor_config_t *config)
{
    char json[8192];
    float value;

    if (!path || !config || read_file_text(path, json, sizeof(json)) != 0) {
        return -1;
    }
    if (!strstr(json, "\"format\": \"dephy_hand_policy_v1\"") &&
        !strstr(json, "\"format\":\"dephy_hand_policy_v1\"")) {
        return -1;
    }

    if (json_find_f32(json, "kp_pos", &value) == 0 && value > 0.0f && value < 100.0f) {
        config->kp_pos = value;
    }
    if (json_find_f32(json, "kd_pos", &value) == 0 && value >= 0.0f && value < 100.0f) {
        config->kd_pos = value;
    }
    if (json_find_f32(json, "kp_rot", &value) == 0 && value > 0.0f && value < 100.0f) {
        config->kp_rot = value;
    }
    if (json_find_f32(json, "kp_grip", &value) == 0 && value > 0.0f && value < 100.0f) {
        config->kp_grip = value;
    }
    if (json_find_f32(json, "speed_scale", &value) == 0 && value > 0.0f && value <= 1.0f) {
        config->max_speed *= value;
        config->max_rot_speed *= value;
        config->max_grip_speed *= value;
    }
    return 0;
}

static int parse_keyframe_line(char *line, dephy_hand_keyframe_t *keyframe)
{
    char *fields[12];
    char *token;
    size_t count = 0;
    uint32_t temp_u32;

    if (!line || !keyframe || line[0] == '#' || line[0] == '\n' || strstr(line, "frame_id") == line) {
        return 1;
    }

    token = strtok(line, ",");
    while (token && count < sizeof(fields) / sizeof(fields[0])) {
        fields[count++] = token;
        token = strtok(0, ",");
    }
    if (count != 12) {
        return -1;
    }

    memset(keyframe, 0, sizeof(*keyframe));
    snprintf(keyframe->frame_id, sizeof(keyframe->frame_id), "%s", fields[0]);
    if (parse_u32(fields[1], &keyframe->t_ms) != 0 ||
        parse_f32(fields[2], &keyframe->x) != 0 ||
        parse_f32(fields[3], &keyframe->y) != 0 ||
        parse_f32(fields[4], &keyframe->z) != 0 ||
        parse_f32(fields[5], &keyframe->yaw) != 0 ||
        parse_f32(fields[6], &keyframe->pitch) != 0 ||
        parse_f32(fields[7], &keyframe->roll) != 0 ||
        parse_f32(fields[8], &keyframe->grip) != 0 ||
        parse_u32(fields[9], &keyframe->hold_ms) != 0 ||
        parse_f32(fields[10], &keyframe->tolerance) != 0 ||
        parse_u32(fields[11], &temp_u32) != 0) {
        return -1;
    }
    keyframe->safety_hold = temp_u32 ? 1 : 0;
    return 0;
}

static int json_find_string(const char *json, const char *key, char *out, size_t out_size)
{
    char pattern[64];
    const char *pos;
    const char *end;
    size_t len;

    if (!json || !key || !out || out_size == 0) {
        return -1;
    }
    if (snprintf(pattern, sizeof(pattern), "\"%s\":\"", key) >= (int)sizeof(pattern)) {
        return -1;
    }
    pos = strstr(json, pattern);
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

static int json_find_u32(const char *json, const char *key, uint32_t *out)
{
    float value;

    if (!out || json_find_f32(json, key, &value) != 0 || value < 0.0f || value > 1000000.0f) {
        return -1;
    }
    *out = (uint32_t)value;
    return 0;
}

static int parse_hand_stream_line(const char *line, dephy_hand_keyframe_t *keyframe)
{
    uint32_t temp_u32;

    if (!line || !keyframe || !strstr(line, "\"event\":\"keyframe\"")) {
        return 1;
    }

    memset(keyframe, 0, sizeof(*keyframe));
    if (json_find_string(line, "frame_id", keyframe->frame_id, sizeof(keyframe->frame_id)) != 0 ||
        json_find_u32(line, "t_ms", &keyframe->t_ms) != 0 ||
        json_find_f32(line, "x", &keyframe->x) != 0 ||
        json_find_f32(line, "y", &keyframe->y) != 0 ||
        json_find_f32(line, "z", &keyframe->z) != 0 ||
        json_find_f32(line, "yaw", &keyframe->yaw) != 0 ||
        json_find_f32(line, "pitch", &keyframe->pitch) != 0 ||
        json_find_f32(line, "roll", &keyframe->roll) != 0 ||
        json_find_f32(line, "grip", &keyframe->grip) != 0 ||
        json_find_u32(line, "hold_ms", &keyframe->hold_ms) != 0 ||
        json_find_f32(line, "tolerance", &keyframe->tolerance) != 0 ||
        json_find_u32(line, "safety_hold", &temp_u32) != 0) {
        return -1;
    }
    keyframe->safety_hold = temp_u32 ? 1 : 0;
    return 0;
}

static int load_keyframes(const char *path, dephy_hand_keyframe_t *frames, size_t *count)
{
    FILE *fp;
    char line[512];
    size_t frame_count = 0;

    if (!path || !frames || !count) {
        return -1;
    }

    fp = fopen(path, "r");
    if (!fp) {
        perror(path);
        return -1;
    }

    while (fgets(line, sizeof(line), fp)) {
        dephy_hand_keyframe_t keyframe;
        int parsed = parse_keyframe_line(line, &keyframe);

        if (parsed == 1) {
            continue;
        }
        if (parsed != 0 || frame_count >= DEPHY_HAND_MAX_KEYFRAMES) {
            fclose(fp);
            return -1;
        }
        frames[frame_count++] = keyframe;
    }

    fclose(fp);
    *count = frame_count;
    return frame_count >= 1 ? 0 : -1;
}

static int load_keyframes_from_stream(const char *path, dephy_hand_keyframe_t *frames, size_t *count)
{
    FILE *fp;
    char line[1024];
    size_t frame_count = 0;

    if (!path || !frames || !count) {
        return -1;
    }

    fp = fopen(path, "r");
    if (!fp) {
        perror(path);
        return -1;
    }

    while (fgets(line, sizeof(line), fp)) {
        dephy_hand_keyframe_t keyframe;
        int parsed = parse_hand_stream_line(line, &keyframe);

        if (parsed == 1) {
            continue;
        }
        if (parsed != 0 || frame_count >= DEPHY_HAND_MAX_KEYFRAMES) {
            fclose(fp);
            return -1;
        }
        frames[frame_count++] = keyframe;
    }

    fclose(fp);
    *count = frame_count;
    return frame_count >= 1 ? 0 : -1;
}

static void print_state(const dephy_hand_state_t *state,
                        const dephy_hand_keyframe_t *target)
{
    printf("%u,%s,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.5f,%.3f,%u\n",
           state->t_ms,
           target->frame_id,
           state->x,
           state->y,
           state->z,
           state->yaw,
           state->pitch,
           state->roll,
           state->grip,
           state->vx,
           state->vy,
           state->vz,
           state->error,
           state->confidence,
           state->reached);
}

static int write_result_json(const char *path,
                             const char *mode,
                             size_t keyframe_count,
                             size_t prediction_frames,
                             size_t observation_count,
                             size_t reached_count,
                             const dephy_hand_state_t *final_state)
{
    FILE *fp;
    int success;

    if (!path || !mode || !final_state) {
        return 0;
    }

    fp = fopen(path, "w");
    if (!fp) {
        perror(path);
        return -1;
    }

    success = final_state->reached || (strcmp(mode, "observed") == 0 && final_state->error <= 0.05f);
    fprintf(fp,
            "{\n"
            "  \"format\": \"dephy_hand_prediction_result_v1\",\n"
            "  \"mode\": \"%s\",\n"
            "  \"keyframes\": %zu,\n"
            "  \"prediction_frames\": %zu,\n"
            "  \"observations\": %zu,\n"
            "  \"reached_keyframes\": %zu,\n"
            "  \"final_t_ms\": %u,\n"
            "  \"final_error\": %.5f,\n"
            "  \"final_confidence\": %.3f,\n"
            "  \"success\": %s\n"
            "}\n",
            mode,
            keyframe_count,
            prediction_frames,
            observation_count,
            reached_count,
            final_state->t_ms,
            final_state->error,
            final_state->confidence,
            success ? "true" : "false");
    fclose(fp);
    return 0;
}

int main(int argc, char **argv)
{
    dephy_hand_predictor_config_t config = dephy_hand_predictor_default_config();
    dephy_hand_keyframe_t keyframes[DEPHY_HAND_MAX_KEYFRAMES];
    dephy_hand_state_t state;
    const char *keyframe_path = 0;
    const char *hand_stream_path = 0;
    const char *policy_path = 0;
    const char *result_path = 0;
    size_t keyframe_count = 0;
    size_t target_index;
    size_t prediction_frames = 0;
    size_t observation_count = 0;
    size_t reached_count = 0;
    int observed_input = 0;
    int i;

    for (i = 1; i < argc; ++i) {
        if (strcmp(argv[i], "--keyframes") == 0 && i + 1 < argc) {
            keyframe_path = argv[++i];
        } else if (strcmp(argv[i], "--from-hand-stream") == 0 && i + 1 < argc) {
            hand_stream_path = argv[++i];
        } else if (strcmp(argv[i], "--policy") == 0 && i + 1 < argc) {
            policy_path = argv[++i];
        } else if (strcmp(argv[i], "--result") == 0 && i + 1 < argc) {
            result_path = argv[++i];
        } else if (strcmp(argv[i], "--observed-input") == 0) {
            observed_input = 1;
        } else if (strcmp(argv[i], "--render-ms") == 0 && i + 1 < argc) {
            if (parse_u32(argv[++i], &config.render_period_ms) != 0 || config.render_period_ms == 0) {
                usage(argv[0]);
                return 2;
            }
        } else if (strcmp(argv[i], "--max-speed") == 0 && i + 1 < argc) {
            if (parse_f32(argv[++i], &config.max_speed) != 0 || config.max_speed <= 0.0f) {
                usage(argv[0]);
                return 2;
            }
        } else if (strcmp(argv[i], "--max-accel") == 0 && i + 1 < argc) {
            if (parse_f32(argv[++i], &config.max_accel) != 0 || config.max_accel <= 0.0f) {
                usage(argv[0]);
                return 2;
            }
        } else {
            usage(argv[0]);
            return 2;
        }
    }

    if (keyframe_path && hand_stream_path) {
        usage(argv[0]);
        return 2;
    }
    if (keyframe_path && load_keyframes(keyframe_path, keyframes, &keyframe_count) != 0) {
        usage(argv[0]);
        return 2;
    }
    if (hand_stream_path && load_keyframes_from_stream(hand_stream_path, keyframes, &keyframe_count) != 0) {
        usage(argv[0]);
        return 2;
    }
    if (!keyframe_path && !hand_stream_path) {
        usage(argv[0]);
        return 2;
    }
    if (policy_path && load_policy_config(policy_path, &config) != 0) {
        fprintf(stderr, "invalid hand policy, using deterministic fallback: %s\n", policy_path);
    }

    state = dephy_hand_state_from_keyframe(&keyframes[0]);
    printf("frame_t_ms,target_frame,palm_x,palm_y,palm_z,yaw,pitch,roll,grip,vx,vy,vz,error,confidence,reached\n");
    print_state(&state, &keyframes[0]);
    prediction_frames = 1;
    reached_count = state.reached ? 1 : 0;
    observation_count = observed_input ? 1 : 0;

    for (target_index = 1; target_index < keyframe_count; ++target_index) {
        const dephy_hand_keyframe_t *target = &keyframes[target_index];
        uint32_t held_ms = 0;
        uint32_t guard_frames = 0;

        if (observed_input) {
            uint32_t target_time = target->t_ms > state.t_ms ? target->t_ms : state.t_ms + config.render_period_ms;

            while (state.t_ms + config.render_period_ms <= target_time && guard_frames < 20000) {
                dephy_hand_state_t next;

                dephy_hand_predict_step(&config, &state, target, &next);
                state = next;
                print_state(&state, target);
                ++prediction_frames;
                ++guard_frames;
            }
            dephy_hand_correct_from_observation(&config, &state, target, &state);
            print_state(&state, target);
            ++prediction_frames;
            ++observation_count;
            if (state.reached) {
                ++reached_count;
            }
            continue;
        }

        while (guard_frames < 20000) {
            dephy_hand_state_t next;

            dephy_hand_predict_step(&config, &state, target, &next);
            state = next;
            print_state(&state, target);
            ++prediction_frames;

            if (state.reached) {
                held_ms += config.render_period_ms;
                if (held_ms >= target->hold_ms) {
                    break;
                }
            } else {
                held_ms = 0;
            }
            ++guard_frames;
        }

        if (guard_frames >= 20000) {
            fprintf(stderr, "failed to reach keyframe: %s\n", target->frame_id);
            return 1;
        }
        ++reached_count;
    }

    if (write_result_json(result_path,
                          observed_input ? "observed" : "keyframe",
                          keyframe_count,
                          prediction_frames,
                          observation_count,
                          reached_count,
                          &state) != 0) {
        return 1;
    }

    return 0;
}
