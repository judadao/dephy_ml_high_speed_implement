import { ANCHOR_MS } from "./demoConstants.js";

export function segmentDurationMs(segment) {
  return Math.max(1, segment.to.t_ms - segment.from.t_ms || ANCHOR_MS);
}

export function resumePlaybackAtCurrentFrame({ playback, segment, now }) {
  const duration = segmentDurationMs(segment);
  const pausedFrameIndex = Math.max(0, playback.lastFrameIndex);
  const pausedRatio = segment.frames.length > 0 ? pausedFrameIndex / segment.frames.length : 0;
  return { ...playback, startTime: now - pausedRatio * duration };
}
