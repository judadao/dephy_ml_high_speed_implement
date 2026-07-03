export function DeviceIoPanel({
  currentRuntimeAnchor,
  currentRuntimeAnchorIndex,
  currentRuntimeRows,
  keyframes,
  latestReceivedAnchorIndex,
  predictionLag,
}) {
  return (
    <>
      <div className="script-panel">
        <div className="timeline-head">
          <span>current runtime io</span>
          <strong>{currentRuntimeAnchorIndex + 1}/{keyframes.length}</strong>
        </div>
        <div className="script-window keyframe-window compact-current">
          <div className="keyframe-script-group active">
            <div className="keyframe active">
              <span>{currentRuntimeAnchor.t_ms}</span>
              <strong>{currentRuntimeAnchor.frame_id}</strong>
              <em>{currentRuntimeAnchor.grip.toFixed(2)}</em>
            </div>
          </div>
        </div>
        <div className="window-range">
          processed by prediction: {currentRuntimeAnchor.frame_id}; latest received: {keyframes[latestReceivedAnchorIndex]?.frame_id ?? "-"}; lag {predictionLag}
        </div>
      </div>

      <div className="current-prediction">
        <div className="timeline-head">
          <span>current keyframe from io</span>
          <strong>{currentRuntimeAnchorIndex + 1}/{keyframes.length}</strong>
        </div>
        <div className="prediction-summary">
          {currentRuntimeRows.map(([label, value]) => (
            <div key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
