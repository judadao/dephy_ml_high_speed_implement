import { ChevronLeft, ChevronRight } from "lucide-react";

export function PlaybackToolbar({
  anchorMs,
  keyframes,
  onSelectKeyframe,
  playMode,
  policyUrl,
  predictedGap,
  realtimeMode,
  renderMs,
  runtimeAnchorsUrl,
  segmentUrl,
  selectedKeyframeIndex,
  sequenceFrames,
  sequenceMode,
  switchPlaybackMode,
  tabContracts,
}) {
  return (
    <>
      <div className="status-strip">
        <div>
          <span>simul</span>
          <strong>{anchorMs}ms</strong>
        </div>
        <div>
          <span>implement</span>
          <strong>{`${renderMs}ms`}</strong>
        </div>
        <div>
          <span>fill</span>
          <strong>{sequenceMode ? `${sequenceFrames.length} live` : `${predictedGap}/gap`}</strong>
        </div>
      </div>

      <div className="source-strip">
        <span>{runtimeAnchorsUrl}</span>
        <span>{sequenceMode ? segmentUrl : policyUrl}</span>
      </div>

      <div className="playback-panel">
        <div className="mode-toggle" role="group" aria-label="playback mode">
          {tabContracts.map((tab) => (
            <button
              type="button"
              className={playMode === tab.mode ? "active" : ""}
              onClick={() => {
                switchPlaybackMode(tab.mode);
              }}
              title={tab.contract}
              key={tab.mode}
            >
              {tab.label}
            </button>
          ))}
        </div>
        {!realtimeMode ? (
          <div className="keyframe-picker">
            <button type="button" onClick={() => onSelectKeyframe((selectedKeyframeIndex - 1 + keyframes.length) % keyframes.length)} title="Previous keyframe">
              <ChevronLeft size={16} />
            </button>
            <select value={selectedKeyframeIndex} onChange={(event) => onSelectKeyframe(Number(event.target.value))}>
              {keyframes.map((item, index) => (
                <option value={index} key={item.frame_id}>
                  {String(index).padStart(2, "0")} {item.frame_id}
                </option>
              ))}
            </select>
            <button type="button" onClick={() => onSelectKeyframe((selectedKeyframeIndex + 1) % keyframes.length)} title="Next keyframe">
              <ChevronRight size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </>
  );
}
