function smoothstep(value) {
  return value * value * (3 - 2 * value);
}

function interpolate(start, target, ratio) {
  const t = smoothstep(ratio);
  return {
    frame_t_ms: start.t_ms + (target.t_ms - start.t_ms) * t,
    target_frame: target.frame_id,
    x: start.x + (target.x - start.x) * t,
    y: start.y + (target.y - start.y) * t,
    z: start.z + (target.z - start.z) * t,
    yaw: start.yaw + (target.yaw - start.yaw) * t,
    pitch: start.pitch + (target.pitch - start.pitch) * t,
    roll: start.roll + (target.roll - start.roll) * t,
    grip: start.grip + (target.grip - start.grip) * t,
  };
}

function endpoint(keyframe) {
  return {
    anchor_id: keyframe.frame_id,
    frame_id: keyframe.frame_id,
    t_ms: keyframe.t_ms,
    source: "sample_keyframes",
    target_kind: "sample_keyframe",
    confidence: 1,
  };
}

export function buildSamplePredictionSegments(keyframes, framesBetweenKeyframes = 100) {
  if (keyframes.length < 2) {
    return [];
  }
  let csvLine = 2;
  return keyframes.slice(0, -1).map((start, index) => {
    const target = keyframes[index + 1];
    const frameCount = Math.max(2, framesBetweenKeyframes + 1);
    const frames = [];
    for (let frameIndex = index === 0 ? 0 : 1; frameIndex < frameCount; frameIndex += 1) {
      const ratio = frameIndex / (frameCount - 1);
      frames.push({
        ...interpolate(start, target, ratio),
        csvLine,
        segmentType: "sample",
      });
      csvLine += 1;
    }
    return {
      key: `${index}-sample-${start.frame_id}-${target.frame_id}`,
      segmentIndex: index,
      segmentType: "sample",
      source: "sample_keyframes",
      from: endpoint(start),
      to: endpoint(target),
      fromAnchor: endpoint(start),
      toAnchor: endpoint(target),
      targetKind: "sample_keyframe",
      confidence: 1,
      isPredictedTarget: false,
      isCorrected: false,
      framesBetweenKeyframes,
      frames,
      startLine: frames[0]?.csvLine ?? 0,
      endLine: frames[frames.length - 1]?.csvLine ?? 0,
    };
  });
}
