export const SAMPLE_KEYFRAME_URL = "/demo/sample_keyframes.csv";
export const KEYFRAME_URL = SAMPLE_KEYFRAME_URL;
export const RUNTIME_ANCHORS_URL = "/demo/runtime_anchors.jsonl";
export const POLICY_URL = "/demo/hand_policy.json";
export const SEGMENTS_URL = "/demo/hand_sequence/prediction_segments.jsonl";
export const RESULT_URL = "/demo/hand_sequence/result.json";

export const RENDER_MS = 16;
export const ANCHOR_MS = 300;
export const UI_UPDATE_MS = 80;
export const VISIBLE_ROW_LIMIT = 15;
export const DEMO_RECORD_LIMIT = 15;
export const PREDICTION_WINDOW_BEFORE = 7;
export const PREDICTION_WINDOW_AFTER = 7;

export const DEFAULT_POLICY = {
  format: "dephy_hand_policy_v1",
  kp_pos: 8.5,
  kd_pos: 2.1,
  kp_rot: 3.2,
  kp_grip: 4.0,
  speed_scale: 0.82,
};

export const PLAY_MODES = {
  REALTIME: "realtime",
  PREDICTION: "prediction",
  ANCHORS: "keyframes",
};

export const TAB_CONTRACTS = [
  {
    mode: PLAY_MODES.REALTIME,
    label: "Realtime Demo",
    contract: "current runtime IO keyframe + current prediction segment + current prediction row",
  },
  {
    mode: PLAY_MODES.PREDICTION,
    label: "Prediction",
    contract: "generated prediction segment list and segment rows",
  },
  {
    mode: PLAY_MODES.ANCHORS,
    label: "Anchors",
    contract: "runtime IO keyframe list only",
  },
];
