export function activeSegmentIndexForFrame(segments, frame) {
  const playbackIndex = segments.findIndex((segment) => segment.frames.some((item) => item.csvLine === frame?.csvLine) || segment.to.frame_id === frame?.target_frame);
  return Math.max(0, playbackIndex >= 0 ? playbackIndex : segments.length - 1);
}

export function activeFrameIndexForSegment(segment, frame) {
  const rawIndex = segment ? segment.frames.findIndex((prediction) => prediction.csvLine === frame?.csvLine) : -1;
  return {
    rawIndex,
    index: Math.max(0, rawIndex),
    isPlaying: rawIndex >= 0,
  };
}

export function currentRuntimeAnchorIndexForDisplay({ realtimeMode, keyframes, activeSegment, frame, selectedKeyframeIndex }) {
  if (!realtimeMode) {
    return selectedKeyframeIndex;
  }
  return Math.max(
    0,
    keyframes.findIndex(
      (item) =>
        item.anchor_id === activeSegment?.toAnchor.anchor_id ||
        item.frame_id === activeSegment?.to.frame_id ||
        item.frame_id === frame?.target_frame
    )
  );
}

export function frameKeyframeIndexForDisplay(keyframes, frame) {
  if (!frame) {
    return 0;
  }
  return Math.max(
    0,
    keyframes.findIndex((item, index) => index === frame.targetIndex || item.frame_id === frame.target_frame || item.t_ms === Math.round(frame.frame_t_ms))
  );
}

export function predictionFrameWindow(segment, activeFrameIndex, before, after) {
  if (!segment) {
    return { start: 0, end: 0, frames: [] };
  }
  const start = Math.max(0, activeFrameIndex - before);
  const end = Math.min(segment.frames.length, activeFrameIndex + after + 1);
  return { start, end, frames: segment.frames.slice(start, end) };
}
