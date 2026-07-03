import { frameFromKeyframe, makeFrameState } from "./demoData.js";

export function findSegmentForAnchor(segments, anchor) {
  if (!anchor) {
    return -1;
  }
  return segments.findIndex(
    (segment) =>
      segment.from.frame_id === anchor.frame_id ||
      segment.to.frame_id === anchor.frame_id ||
      segment.fromAnchor.anchor_id === anchor.anchor_id ||
      segment.toAnchor.anchor_id === anchor.anchor_id
  );
}

export function anchorFrameAt(keyframes, index) {
  const keyframe = keyframes[index];
  return keyframe ? frameFromKeyframe(keyframe, index) : null;
}

export function predictionFrameForAnchor({ keyframes, segments, index, previousFrame, sequenceResult }) {
  const keyframe = keyframes[index];
  if (!keyframe) {
    return { segmentIndex: -1, segment: null, frame: null };
  }
  const foundIndex = findSegmentForAnchor(segments, keyframe);
  const segmentIndex = foundIndex >= 0 ? foundIndex : -1;
  const segment = segmentIndex >= 0 ? segments[segmentIndex] : null;
  if (segment?.frames.length) {
    return {
      segmentIndex,
      segment,
      frame: makeFrameState(segment.frames[0], previousFrame, sequenceResult),
    };
  }
  return { segmentIndex, segment: null, frame: frameFromKeyframe(keyframe, index) };
}
