import assert from "node:assert/strict";
import {
  clampKeyframeIndex,
  isManualReviewMode,
  keyframesForMode,
  nextAnchorPlayback,
  nextSegmentPlayback,
  playButtonState,
  shouldRunPlayback,
  startPlaybackState,
  usesSampleKeyframesMode,
} from "../web/src/playbackController.js";
import { PLAY_MODES } from "../web/src/demoConstants.js";
import { buildSamplePredictionSegments } from "../web/src/samplePredictionSegments.js";

const segment = {
  from: { t_ms: 0 },
  to: { t_ms: 500 },
  frames: [
    { csvLine: 10, frame_t_ms: 0 },
    { csvLine: 11, frame_t_ms: 125 },
    { csvLine: 12, frame_t_ms: 250 },
    { csvLine: 13, frame_t_ms: 375 },
  ],
};

assert.equal(isManualReviewMode(PLAY_MODES.ANCHORS), true);
assert.equal(isManualReviewMode(PLAY_MODES.REALTIME), false);
assert.equal(usesSampleKeyframesMode(PLAY_MODES.PREDICTION), true);
assert.equal(usesSampleKeyframesMode(PLAY_MODES.ANCHORS), true);
assert.equal(usesSampleKeyframesMode(PLAY_MODES.REALTIME), false);

assert.equal(playButtonState({ playMode: PLAY_MODES.ANCHORS, running: false }).label, "Play");
assert.equal(playButtonState({ playMode: PLAY_MODES.ANCHORS, running: true }).label, "Pause");
assert.equal(playButtonState({ playMode: PLAY_MODES.REALTIME, running: false }).label, "Play");
assert.equal(playButtonState({ playMode: PLAY_MODES.PREDICTION, running: true }).label, "Pause");

assert.equal(shouldRunPlayback({ playMode: PLAY_MODES.ANCHORS, running: true, playbackReady: true }), true);
assert.equal(shouldRunPlayback({ playMode: PLAY_MODES.REALTIME, running: true, playbackReady: true }), true);
assert.equal(shouldRunPlayback({ playMode: PLAY_MODES.PREDICTION, running: true, playbackReady: true }), true);

const liveKeyframes = [{ frame_id: "live_1" }, { frame_id: "live_2" }];
const sampleKeyframes = [{ frame_id: "sample_1" }];
assert.equal(keyframesForMode({ playMode: PLAY_MODES.ANCHORS, liveKeyframes, sampleKeyframes })[0].frame_id, "sample_1");
assert.equal(keyframesForMode({ playMode: PLAY_MODES.PREDICTION, liveKeyframes, sampleKeyframes })[0].frame_id, "sample_1");
assert.equal(keyframesForMode({ playMode: PLAY_MODES.REALTIME, liveKeyframes, sampleKeyframes })[0].frame_id, "live_1");
assert.equal(clampKeyframeIndex(99, sampleKeyframes), 0);
assert.equal(clampKeyframeIndex(-2, liveKeyframes), 0);
assert.equal(clampKeyframeIndex(1, liveKeyframes), 1);

const anchorAdvance = nextAnchorPlayback({
  keyframes: liveKeyframes,
  currentIndex: 0,
  now: 500,
  lastTick: 0,
  sampleMs: 500,
});
assert.equal(anchorAdvance.index, 1);
assert.equal(anchorAdvance.keyframe.frame_id, "live_2");

const anchorStart = startPlaybackState({
  playMode: PLAY_MODES.ANCHORS,
  playback: { segmentIndex: 0, startTime: 0, lastFrameIndex: -1 },
  segment,
  segmentCount: 1,
  now: 1000,
});
assert.equal(anchorStart.running, true);
assert.deepEqual(anchorStart.playback, { segmentIndex: 0, startTime: 0, lastFrameIndex: -1 });

const realtimeStart = startPlaybackState({
  playMode: PLAY_MODES.REALTIME,
  playback: { segmentIndex: 0, startTime: 0, lastFrameIndex: 1 },
  segment,
  segmentCount: 1,
  now: 1000,
});
assert.equal(realtimeStart.running, true);
assert.ok(realtimeStart.playback.startTime < 1000);

const firstAdvance = nextSegmentPlayback({
  segments: [segment],
  playback: { segmentIndex: 0, startTime: 0, lastFrameIndex: -1 },
  now: 260,
});
assert.equal(firstAdvance.status, "advanced");
assert.equal(firstAdvance.frame.csvLine, 12);
assert.deepEqual(firstAdvance.playback, { segmentIndex: 0, startTime: 0, lastFrameIndex: 2 });

const endAdvance = nextSegmentPlayback({
  segments: [segment],
  playback: { segmentIndex: 0, startTime: 0, lastFrameIndex: 2 },
  now: 600,
});
assert.equal(endAdvance.status, "advanced");
assert.equal(endAdvance.frame.csvLine, 13);

const sampleSegments = buildSamplePredictionSegments(
  [
    { frame_id: "sample_open", t_ms: 0, x: 0, y: 0, z: 0, yaw: 0, pitch: 0, roll: 0, grip: 0 },
    { frame_id: "sample_close", t_ms: 500, x: 1, y: 1, z: 1, yaw: 1, pitch: 1, roll: 1, grip: 1 },
  ],
  4
);
assert.equal(sampleSegments.length, 1);
assert.equal(sampleSegments[0].source, "sample_keyframes");
assert.equal(sampleSegments[0].fromAnchor.source, "sample_keyframes");
assert.equal(sampleSegments[0].toAnchor.anchor_id, "sample_close");
assert.equal(sampleSegments[0].frames.at(-1).target_frame, "sample_close");
assert.equal(JSON.stringify(sampleSegments).includes("runtime_io"), false);

console.log("web playback controller ok");
