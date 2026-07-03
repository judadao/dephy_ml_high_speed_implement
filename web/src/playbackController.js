import { PLAY_MODES } from "./demoConstants.js";
import { segmentDurationMs } from "./playbackTiming.js";

export function isManualReviewMode(playMode) {
  return playMode === PLAY_MODES.ANCHORS;
}

export function usesSampleKeyframesMode(playMode) {
  return playMode === PLAY_MODES.PREDICTION || playMode === PLAY_MODES.ANCHORS;
}

export function playButtonState({ playMode, running }) {
  return {
    disabled: false,
    label: running ? "Pause" : "Play",
    title: running ? "Pause" : "Play",
  };
}

export function shouldRunPlayback({ playMode, running, playbackReady }) {
  return Boolean(running && playbackReady);
}

export function keyframesForMode({ playMode, liveKeyframes, sampleKeyframes }) {
  if (usesSampleKeyframesMode(playMode) && sampleKeyframes.length > 0) {
    return sampleKeyframes;
  }
  return liveKeyframes;
}

export function clampKeyframeIndex(index, keyframes) {
  if (keyframes.length === 0) {
    return 0;
  }
  return Math.max(0, Math.min(index, keyframes.length - 1));
}

export function startPlaybackState({ playMode, playback, segment, segmentCount, now }) {
  if (isManualReviewMode(playMode)) {
    return { running: true, playback };
  }
  if (!segment || segmentCount === 0) {
    return { running: true, playback };
  }
  const isAtEnd = playback.lastFrameIndex >= segment.frames.length - 1 && playback.segmentIndex >= segmentCount - 1;
  if (isAtEnd) {
    return { running: true, playback: { segmentIndex: 0, startTime: now, lastFrameIndex: -1 } };
  }
  const duration = segmentDurationMs(segment);
  const pausedFrameIndex = Math.max(0, playback.lastFrameIndex);
  const pausedRatio = segment.frames.length > 0 ? pausedFrameIndex / segment.frames.length : 0;
  return {
    running: true,
    playback: { ...playback, startTime: now - pausedRatio * duration },
  };
}

export function nextAnchorPlayback({ keyframes, currentIndex, now, lastTick, sampleMs }) {
  if (keyframes.length === 0 || now - lastTick < sampleMs) {
    return null;
  }
  const index = (currentIndex + 1) % keyframes.length;
  return {
    index,
    lastTick: now,
    keyframe: keyframes[index],
  };
}

export function nextSegmentPlayback({ segments, playback, now }) {
  if (!segments.length) {
    return { playback, frame: null, status: "empty" };
  }
  let nextPlayback = playback;
  let segment = segments[nextPlayback.segmentIndex] || segments[0];
  if (!segment.frames.length) {
    return { playback: nextPlayback, frame: null, status: "empty-segment" };
  }

  let duration = segmentDurationMs(segment);
  let elapsed = now - nextPlayback.startTime;
  while (elapsed >= duration) {
    if (nextPlayback.segmentIndex >= segments.length - 1) {
      const lastFrameIndex = segment.frames.length - 1;
      if (nextPlayback.lastFrameIndex === lastFrameIndex) {
        return { playback: nextPlayback, frame: null, status: "same-frame" };
      }
      return {
        playback: { ...nextPlayback, lastFrameIndex },
        frame: segment.frames[lastFrameIndex],
        status: "advanced",
      };
    }

    const nextSegmentIndex = nextPlayback.segmentIndex + 1;
    const overflow = elapsed - duration;
    nextPlayback = { segmentIndex: nextSegmentIndex, startTime: now - overflow, lastFrameIndex: -1 };
    segment = segments[nextSegmentIndex];
    if (!segment.frames.length) {
      return { playback: nextPlayback, frame: null, status: "empty-segment" };
    }
    duration = segmentDurationMs(segment);
    elapsed = overflow;
  }

  const ratio = Math.max(0, Math.min(elapsed / duration, 1));
  const frameIndex = Math.min(segment.frames.length - 1, Math.floor(ratio * segment.frames.length));
  if (frameIndex === nextPlayback.lastFrameIndex) {
    return { playback: nextPlayback, frame: null, status: "same-frame" };
  }
  return {
    playback: { ...nextPlayback, lastFrameIndex: frameIndex },
    frame: segment.frames[frameIndex],
    status: "advanced",
  };
}
