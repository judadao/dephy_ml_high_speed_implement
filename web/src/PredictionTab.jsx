import { ChevronDown, ChevronRight } from "lucide-react";
import { formatPredictionCsvRow } from "./demoData.js";

export function PredictionTab({
  activeKeyframeIndex,
  activeKeyframeRowRef,
  activeSegment,
  activeSegmentFrameIndex,
  activeSegmentIndex,
  activeSegmentIsPlaying,
  activeSegmentProgress,
  expandedSegments,
  frame,
  keyframeScrollRef,
  keyframes,
  predictionSegments,
  sampleKeyframes,
  sequenceCsvRows,
  showKeyframe,
  toggleSegment,
  visibleKeyframes,
  visibleRowLimit,
  windowAfter,
  windowBefore,
}) {
  return (
    <>
      <div className="current-prediction">
        <div className="timeline-head">
          <span>current prediction</span>
          <strong>{activeSegment ? `${activeSegmentProgress}%` : "-"}</strong>
        </div>
        <div className="prediction-summary">
          <div>
            <span>type</span>
            <strong>{activeSegment?.segmentType ?? "-"}</strong>
          </div>
          <div>
            <span>from</span>
            <strong>{activeSegment?.fromAnchor.anchor_id ?? "-"}</strong>
          </div>
          <div>
            <span>to</span>
            <strong>{activeSegment?.toAnchor.anchor_id ?? "-"}</strong>
          </div>
          <div>
            <span>target</span>
            <strong>{activeSegment?.targetKind ?? "-"}</strong>
          </div>
          <div>
            <span>row</span>
            <strong>{activeSegment && activeSegmentIsPlaying ? `${activeSegmentFrameIndex + 1}/${activeSegment.frames.length}` : activeSegment ? `waiting/${activeSegment.frames.length}` : "-"}</strong>
          </div>
          <div>
            <span>confidence</span>
            <strong>{activeSegment ? activeSegment.confidence.toFixed(2) : "-"}</strong>
          </div>
        </div>
      </div>

      <div className="script-panels">
        <div className="script-panel">
          <div className="timeline-head">
            <span>sample key frames</span>
            <strong>{activeKeyframeIndex + 1}/{keyframes.length}</strong>
          </div>
          <div className="script-window keyframe-window" ref={keyframeScrollRef}>
            {visibleKeyframes.map((item) => {
              const keyframeIndex = keyframes.findIndex((keyframe) => keyframe.frame_id === item.frame_id);
              const segmentsForKeyframe = predictionSegments.filter(
                (segment) =>
                  segment.from.frame_id === item.frame_id ||
                  segment.to.frame_id === item.frame_id ||
                  (segment.segmentType === "correction" && segment.to.frame_id === item.frame_id)
              );
              const isActive = keyframeIndex === activeKeyframeIndex;
              return (
                <div className={isActive ? "keyframe-script-group active" : "keyframe-script-group"} key={item.frame_id}>
                  <button type="button" className={isActive ? "keyframe active" : "keyframe"} onClick={() => showKeyframe(keyframeIndex)} ref={isActive ? activeKeyframeRowRef : null}>
                    <span>{item.t_ms}</span>
                    <strong>{item.frame_id}</strong>
                    <em>{item.grip.toFixed(2)}</em>
                  </button>
                  {segmentsForKeyframe.map((segment) => {
                    const isOpen = Boolean(expandedSegments[segment.key]);
                    const isActiveSegment = segment.segmentIndex === activeSegment?.segmentIndex;
                    const segmentActiveIndex = Math.max(0, segment.frames.findIndex((prediction) => prediction.csvLine === frame.csvLine));
                    const windowStart = isActiveSegment ? Math.max(0, segmentActiveIndex - windowBefore) : 0;
                    const windowEnd = isActiveSegment ? Math.min(segment.frames.length, segmentActiveIndex + windowAfter + 1) : Math.min(segment.frames.length, visibleRowLimit);
                    const visibleFrames = segment.frames.slice(windowStart, windowEnd);
                    return (
                      <div className="keyframe-prediction-block" key={segment.key}>
                        <button type="button" className={`segment-toggle ${segment.segmentType}`} onClick={() => toggleSegment(segment.key)}>
                          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          <span>{segment.segmentType}</span>
                          <strong>{segment.frames.length} rows</strong>
                          <span>{isActiveSegment ? `${segment.fromAnchor.anchor_id} -> ${segment.toAnchor.anchor_id}` : `queued -> ${segment.toAnchor.anchor_id}`}</span>
                        </button>
                        {isOpen && isActiveSegment ? (
                          <div className="predicted-list">
                            <div className="script-row header">
                              <span>#</span>
                              <code>{sequenceCsvRows[0] || "frame_t_ms,target_frame,palm_x,palm_y,palm_z,yaw,pitch,roll,grip"}</code>
                            </div>
                            {visibleFrames.map((prediction) => {
                              const predictionRow = formatPredictionCsvRow(prediction);
                              const isActivePrediction = prediction.csvLine === frame.csvLine;
                              return (
                                <div className={isActivePrediction ? "script-row prediction-row active" : "script-row prediction-row"} key={`${prediction.csvLine}-${prediction.frame_t_ms}`}>
                                  <span>{prediction.csvLine}</span>
                                  <code>{predictionRow}</code>
                                </div>
                              );
                            })}
                            {segment.frames.length > visibleFrames.length ? (
                              <div className="window-range">
                                rows {segment.startLine + windowStart}-{segment.startLine + windowEnd - 1} of {segment.startLine}-{segment.endLine}
                              </div>
                            ) : null}
                          </div>
                        ) : isOpen ? <div className="window-range">queued segment; rows are shown only when this segment is active</div> : null}
                      </div>
                    );
                  })}
                </div>
              );
            })}
          </div>
          <div className="window-range">
            segment {predictionSegments.length ? activeSegmentIndex + 1 : 0}/{predictionSegments.length}: {activeSegment?.segmentType ?? "-"} {activeSegment?.from.frame_id ?? "-"} - {activeSegment?.to.frame_id ?? "-"}
          </div>
        </div>
        <ReferenceSamplesPanel sampleKeyframes={sampleKeyframes} visibleRowLimit={visibleRowLimit} />
      </div>
    </>
  );
}

function ReferenceSamplesPanel({ sampleKeyframes, visibleRowLimit }) {
  return (
    <div className="script-panel">
      <div className="timeline-head">
        <span>reference samples</span>
        <strong>{sampleKeyframes.length}</strong>
      </div>
      <div className="script-window keyframe-window">
        {sampleKeyframes.slice(0, visibleRowLimit).map((item, index) => (
          <div className="keyframe-script-group" key={`${item.frame_id}-${index}`}>
            <div className="keyframe sample-keyframe">
              <span>{item.t_ms}</span>
              <strong>{item.frame_id}</strong>
              <em>{item.grip.toFixed(2)}</em>
            </div>
          </div>
        ))}
      </div>
      <div className="window-range">sample_keyframes.csv reference; prediction rows are sample-derived in this tab</div>
    </div>
  );
}
