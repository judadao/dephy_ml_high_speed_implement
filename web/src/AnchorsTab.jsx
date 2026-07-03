export function AnchorsTab({
  activeKeyframeIndex,
  activeKeyframeRowRef,
  keyframeScrollRef,
  keyframes,
  sampleKeyframes,
  showKeyframe,
  visibleRuntimeAnchors,
  visibleRowLimit,
}) {
  return (
    <div className="script-panels">
      <div className="script-panel">
        <div className="timeline-head">
          <span>runtime io anchors</span>
          <strong>{activeKeyframeIndex + 1}/{keyframes.length}</strong>
        </div>
        <div className="script-window keyframe-window" ref={keyframeScrollRef}>
          {visibleRuntimeAnchors.map((item) => {
            const keyframeIndex = keyframes.findIndex((anchor) => anchor.anchor_id === item.anchor_id || anchor.frame_id === item.frame_id);
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
        <div className="window-range">raw runtime IO anchors only</div>
      </div>

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
        <div className="window-range">training/reference only; runtime prediction uses anchors</div>
      </div>
    </div>
  );
}
