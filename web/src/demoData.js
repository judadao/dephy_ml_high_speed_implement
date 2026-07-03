import { RENDER_MS } from "./demoConstants.js";

export function parseCsv(text) {
  if (!text.trim()) {
    return [];
  }
  const [headerLine, ...rows] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return rows.map((row) => {
    const values = row.split(",");
    const item = Object.fromEntries(headers.map((key, index) => [key, values[index]]));
    return {
      frame_id: item.frame_id,
      t_ms: Number(item.t_ms),
      x: Number(item.x),
      y: Number(item.y),
      z: Number(item.z),
      yaw: Number(item.yaw),
      pitch: Number(item.pitch),
      roll: Number(item.roll),
      grip: Number(item.grip),
      hold_ms: Number(item.hold_ms),
      tolerance: Number(item.tolerance),
      safety_hold: Number(item.safety_hold),
    };
  });
}

export function parseRuntimeAnchorsJsonl(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const anchor = JSON.parse(line);
      const pose = anchor.observed_pose || {};
      return {
        frame_id: anchor.anchor_id,
        anchor_id: anchor.anchor_id,
        t_ms: Number(anchor.t_ms),
        x: Number(pose.x),
        y: Number(pose.y),
        z: Number(pose.z),
        yaw: Number(pose.yaw),
        pitch: Number(pose.pitch),
        roll: Number(pose.roll),
        grip: Number(pose.grip),
        confidence: Number(anchor.confidence ?? 0.85),
        jitter: Number(anchor.jitter ?? 0),
        source: anchor.source || "runtime_anchor",
      };
    });
}

export function frameFromKeyframe(keyframe, index = 0) {
  return {
    frame_t_ms: keyframe.t_ms,
    targetIndex: index,
    x: keyframe.x,
    y: keyframe.y,
    z: keyframe.z,
    yaw: keyframe.yaw,
    pitch: keyframe.pitch,
    roll: keyframe.roll,
    grip: keyframe.grip,
    vx: 0,
    vy: 0,
    vz: 0,
    error: 0,
    confidence: 0.95,
    csvLine: index + 2,
    anchorLoop: 1,
    keyframeLock: true,
    target_frame: keyframe.frame_id,
  };
}

function segmentEndpoint(value, fallbackId, fallbackMs) {
  if (value && typeof value === "object") {
    return {
      anchor_id: value.anchor_id ?? value.frame_id ?? fallbackId,
      frame_id: value.frame_id ?? value.anchor_id ?? fallbackId,
      t_ms: Number(value.t_ms ?? fallbackMs ?? 0),
      source: value.source ?? "runtime_anchor",
      target_kind: value.target_kind ?? "observed_anchor",
      confidence: Number(value.confidence ?? 0.85),
    };
  }
  return { anchor_id: value ?? fallbackId, frame_id: value ?? fallbackId, t_ms: Number(fallbackMs ?? 0), source: "runtime_anchor", target_kind: "observed_anchor", confidence: 0.85 };
}

function normalizePredictionFrame(frame, segmentType) {
  return {
    frame_t_ms: Number(frame.frame_t_ms),
    target_frame: frame.target_frame,
    x: Number(frame.palm_x),
    y: Number(frame.palm_y),
    z: Number(frame.palm_z),
    yaw: Number(frame.yaw),
    pitch: Number(frame.pitch),
    roll: Number(frame.roll),
    grip: Number(frame.grip),
    csvLine: Number(frame.csvLine),
    segmentType,
  };
}

export function parsePredictionSegmentsJsonl(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      const segment = JSON.parse(line);
      const segmentType = segment.segment_type || "confirmed";
      const frames = (segment.frames || []).map((frame) => normalizePredictionFrame(frame, segmentType));
      return {
        key: `${segment.segment_index ?? index}-${segmentType}-${segment.from?.frame_id ?? segment.from}-${segment.to?.frame_id ?? segment.to}`,
        segmentIndex: Number(segment.segment_index ?? index),
        segmentType,
        source: segment.source || "loaded_segments",
        from: segmentEndpoint(segment.from, `from_${index}`, segment.start_t_ms),
        to: segmentEndpoint(segment.to, `to_${index}`, segment.target_t_ms),
        fromAnchor: segmentEndpoint(segment.from_anchor || segment.from, `from_${index}`, segment.start_t_ms),
        toAnchor: segmentEndpoint(segment.to_anchor || segment.to, `to_${index}`, segment.target_t_ms),
        targetKind: segment.target_kind || (segment.is_predicted_target ? "predicted_anchor" : "observed_anchor"),
        confidence: Number(segment.confidence ?? 0.95),
        isPredictedTarget: Boolean(segment.is_predicted_target),
        isCorrected: Boolean(segment.is_corrected),
        framesBetweenKeyframes: Number(segment.frames_between_keyframes ?? Math.max(0, frames.length - 1)),
        frames,
        startLine: frames[0]?.csvLine ?? 0,
        endLine: frames[frames.length - 1]?.csvLine ?? 0,
      };
    });
}

export function flattenPredictionSegments(segments) {
  return segments.flatMap((segment) => segment.frames);
}

export function makeFrameState(nextFrame, previous, sequenceResult) {
  const dt = previous ? Math.max((nextFrame.frame_t_ms - previous.frame_t_ms) / 1000, 0.001) : RENDER_MS / 1000;
  return {
    frame_t_ms: nextFrame.frame_t_ms,
    targetIndex: 0,
    x: nextFrame.x,
    y: nextFrame.y,
    z: nextFrame.z,
    yaw: nextFrame.yaw,
    pitch: nextFrame.pitch,
    roll: nextFrame.roll,
    grip: nextFrame.grip,
    vx: previous ? (nextFrame.x - previous.x) / dt : 0,
    vy: previous ? (nextFrame.y - previous.y) / dt : 0,
    vz: previous ? (nextFrame.z - previous.z) / dt : 0,
    error: sequenceResult?.last_error ?? sequenceResult?.final_error ?? 0,
    confidence: sequenceResult?.success ? 1 : 0.85,
    csvLine: nextFrame.csvLine,
    anchorLoop: 1,
    target_frame: nextFrame.target_frame,
    keyframeLock: false,
  };
}

export function formatPredictionCsvRow(frame) {
  return [
    Number(frame.frame_t_ms).toFixed(3).replace(/\.000$/, ""),
    frame.target_frame,
    frame.x.toFixed(6),
    frame.y.toFixed(6),
    frame.z.toFixed(6),
    frame.yaw.toFixed(6),
    frame.pitch.toFixed(6),
    frame.roll.toFixed(6),
    frame.grip.toFixed(6),
  ].join(",");
}
