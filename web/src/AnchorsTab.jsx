export function AnchorsTab({
  activeKeyframeIndex,
  activeKeyframeRowRef,
  keyframeScrollRef,
  keyframes,
  showKeyframe,
  visibleKeyframes,
}) {
  return (
    <div className="script-panels">
      <div className="script-panel">
        <div className="timeline-head">
          <span>sample key frames</span>
          <strong>{activeKeyframeIndex + 1}/{keyframes.length}</strong>
        </div>
        <div className="script-window keyframe-window" ref={keyframeScrollRef}>
          {visibleKeyframes.map((item) => {
            const keyframeIndex = keyframes.findIndex((keyframe) => keyframe.frame_id === item.frame_id);
            const isActive = keyframeIndex === activeKeyframeIndex;
            return (
              <div className={isActive ? "keyframe-script-group active" : "keyframe-script-group"} key={item.frame_id}>
                <button type="button" className={isActive ? "keyframe active" : "keyframe"} onClick={() => showKeyframe(keyframeIndex)} ref={isActive ? activeKeyframeRowRef : null}>
                  <span>{item.t_ms}</span>
                  <strong>{item.frame_id}</strong>
                  <em>{item.grip.toFixed(2)}</em>
                </button>
              </div>
            );
          })}
        </div>
        <div className="window-range">complete sample_keyframes.csv playback source</div>
      </div>
    </div>
  );
}
