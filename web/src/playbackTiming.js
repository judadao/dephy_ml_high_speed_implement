import { ANCHOR_MS } from "./demoConstants.js";

export function segmentDurationMs(segment) {
  return Math.max(1, segment.to.t_ms - segment.from.t_ms || ANCHOR_MS);
}
