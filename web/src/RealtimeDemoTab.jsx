import { DeviceIoPanel } from "./DeviceIoPanel.jsx";
import { formatPredictionCsvRow } from "./demoData.js";

export function RealtimeDemoTab({
  activeSegment,
  activeSegmentFrameIndex,
  activeSegmentIndex,
  activeSegmentIsPlaying,
  activeSegmentProgress,
  currentRuntimeAnchor,
  currentRuntimeAnchorIndex,
  currentRuntimeRows,
  frame,
  keyframes,
  latestReceivedAnchorIndex,
  predictionLag,
  predictionSegments,
  sequenceCsvRows,
  visibleActivePredictionFrames,
}) {
  return (
    <>
      <DeviceIoPanel
        currentRuntimeAnchor={currentRuntimeAnchor}
        currentRuntimeAnchorIndex={currentRuntimeAnchorIndex}
        currentRuntimeRows={currentRuntimeRows}
        keyframes={keyframes}
        latestReceivedAnchorIndex={latestReceivedAnchorIndex}
        predictionLag={predictionLag}
      />

      <div className="current-prediction">
        <div className="timeline-head">
          <span>prediction for current keyframe</span>
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

      <div className="script-panel">
        <div className="timeline-head">
          <span>current prediction rows</span>
          <strong>{activeSegment && activeSegmentIsPlaying ? `${activeSegmentFrameIndex + 1}/${activeSegment.frames.length}` : "-"}</strong>
        </div>
        <div className="predicted-list realtime-prediction-list">
          <div className="script-row header">
            <span>#</span>
            <code>{sequenceCsvRows[0] || "frame_t_ms,target_frame,palm_x,palm_y,palm_z,yaw,pitch,roll,grip"}</code>
          </div>
          {visibleActivePredictionFrames.map((prediction) => {
            const predictionRow = formatPredictionCsvRow(prediction);
            const isActivePrediction = prediction.csvLine === frame.csvLine;
            return (
              <div className={isActivePrediction ? "script-row prediction-row active" : "script-row prediction-row"} key={`${prediction.csvLine}-${prediction.frame_t_ms}`}>
                <span>{prediction.csvLine}</span>
                <code>{predictionRow}</code>
              </div>
            );
          })}
        </div>
        <div className="window-range">
          segment {predictionSegments.length ? activeSegmentIndex + 1 : 0}/{predictionSegments.length}: {activeSegment?.segmentType ?? "-"} {activeSegment?.from.frame_id ?? "-"} - {activeSegment?.to.frame_id ?? "-"}
        </div>
      </div>
    </>
  );
}
