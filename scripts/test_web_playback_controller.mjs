import assert from "node:assert/strict";
import {
  isManualReviewMode,
  nextSegmentPlayback,
  playButtonState,
  shouldRunPlayback,
  startPlaybackState,
} from "../web/src/playbackController.js";
import { PLAY_MODES } from "../web/src/demoConstants.js";

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

assert.deepEqual(playButtonState({ playMode: PLAY_MODES.ANCHORS, running: true }), {
  disabled: true,
  label: "Manual",
  title: "Anchors are manual review only",
});
assert.equal(playButtonState({ playMode: PLAY_MODES.REALTIME, running: false }).label, "Play");
assert.equal(playButtonState({ playMode: PLAY_MODES.PREDICTION, running: true }).label, "Pause");

assert.equal(shouldRunPlayback({ playMode: PLAY_MODES.ANCHORS, running: true, playbackReady: true }), false);
assert.equal(shouldRunPlayback({ playMode: PLAY_MODES.REALTIME, running: true, playbackReady: true }), true);
assert.equal(shouldRunPlayback({ playMode: PLAY_MODES.PREDICTION, running: true, playbackReady: true }), true);

const anchorStart = startPlaybackState({
  playMode: PLAY_MODES.ANCHORS,
  playback: { segmentIndex: 0, startTime: 0, lastFrameIndex: -1 },
  segment,
  segmentCount: 1,
  now: 1000,
});
assert.equal(anchorStart.running, false);
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

console.log("web playback controller ok");
