import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChevronDown, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import { HandScene } from "./HandScene.jsx";
import { activeFrameIndexForSegment, activeSegmentIndexForFrame, currentRuntimeAnchorIndexForDisplay, frameKeyframeIndexForDisplay, predictionFrameWindow } from "./demoDisplay.js";
import { ANCHOR_MS, DEFAULT_POLICY, DEMO_RECORD_LIMIT, KEYFRAME_URL, PLAY_MODES, POLICY_URL, PREDICTION_WINDOW_AFTER, PREDICTION_WINDOW_BEFORE, RENDER_MS, RESULT_URL, RUNTIME_ANCHORS_URL, SAMPLE_KEYFRAME_URL, SEGMENTS_URL, TAB_CONTRACTS, UI_UPDATE_MS, VISIBLE_ROW_LIMIT } from "./demoConstants.js";
import { flattenPredictionSegments, formatPredictionCsvRow, frameFromKeyframe, makeFrameState, parseCsv, parsePredictionSegmentsJsonl, parseRuntimeAnchorsJsonl } from "./demoData.js";
import { anchorFrameAt, predictionFrameForAnchor } from "./manualPlayback.js";
import { resumePlaybackAtCurrentFrame, segmentDurationMs } from "./playbackTiming.js";
import "./styles.css";

function App() {
  const [sampleKeyframes, setSampleKeyframes] = useState([]);
  const [runtimeAnchors, setRuntimeAnchors] = useState([]);
  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [sequenceSegments, setSequenceSegments] = useState([]);
  const [sequenceFrames, setSequenceFrames] = useState([]);
  const [sequenceResult, setSequenceResult] = useState(null);
  const [sequenceStatus, setSequenceStatus] = useState("waiting");
  const segmentsTextRef = useRef("");
  const predictionSegmentsRef = useRef([]);
  const segmentPlaybackRef = useRef({ segmentIndex: 0, startTime: 0, lastFrameIndex: -1 });
  const playableSegmentCountRef = useRef(0);
  const latestPlayableSegmentKeyRef = useRef("");
  const [dataStatus, setDataStatus] = useState("loading");
  const frameRef = useRef(null);
  const keyframeCsvRef = useRef("");
  const runtimeAnchorsTextRef = useRef("");
  const keyframeScrollRef = useRef(null);
  const activeKeyframeRowRef = useRef(null);
  const [frame, setFrame] = useState(frameRef.current);
  const lastUiUpdateRef = useRef(0);
  const [running, setRunning] = useState(true);
  const [playMode, setPlayMode] = useState(PLAY_MODES.REALTIME);
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState(0);
  const [expandedSegments, setExpandedSegments] = useState({});

  const keyframes = runtimeAnchors;

  function applySampleKeyframesText(csv) {
    if (csv === keyframeCsvRef.current) {
      return;
    }
    const loadedKeyframes = parseCsv(csv, DEMO_RECORD_LIMIT);
    keyframeCsvRef.current = csv;
    setSampleKeyframes(loadedKeyframes);
  }

  function applyRuntimeAnchorsText(text) {
    if (text === runtimeAnchorsTextRef.current) {
      return;
    }
    const loadedAnchors = parseRuntimeAnchorsJsonl(text, DEMO_RECORD_LIMIT);
    runtimeAnchorsTextRef.current = text;
    setRuntimeAnchors(loadedAnchors);
    setSelectedKeyframeIndex((current) => Math.max(0, Math.min(current, loadedAnchors.length - 1)));
    if (!frameRef.current && loadedAnchors.length > 0) {
      frameRef.current = frameFromKeyframe(loadedAnchors[0], 0);
      setFrame(frameRef.current);
    }
    setDataStatus(loadedAnchors.length > 0 ? "runtime anchors loaded" : "waiting for runtime anchor");
  }

  function applySegmentsText(text) {
    if (text === segmentsTextRef.current) {
      setSequenceStatus("sse loaded");
      return;
    }
    const previousText = segmentsTextRef.current;
    segmentsTextRef.current = text;
    const segments = parsePredictionSegmentsJsonl(text, DEMO_RECORD_LIMIT);
    const frames = flattenPredictionSegments(segments);
    const isInitialLoad = previousText.length === 0;
    setSequenceSegments(segments);
    setSequenceFrames(frames);
    if (isInitialLoad) {
      segmentPlaybackRef.current = { segmentIndex: 0, startTime: performance.now(), lastFrameIndex: -1 };
    }
    if (isInitialLoad && playMode !== PLAY_MODES.ANCHORS && frames.length > 0) {
      const first = frames[0];
      frameRef.current = makeFrameState(first, null, null);
      setFrame(frameRef.current);
    }
    setSequenceStatus("sse loaded");
  }

  function applyPolicyText(text) {
    setPolicy({ ...DEFAULT_POLICY, ...JSON.parse(text) });
  }

  function applyResultText(text) {
    if (text.trim()) {
      setSequenceResult(JSON.parse(text));
    }
  }

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      fetch(KEYFRAME_URL).then((response) => {
        if (!response.ok) {
          throw new Error(KEYFRAME_URL);
        }
        return response.text();
      }),
      fetch(POLICY_URL).then((response) => {
        if (!response.ok) {
          throw new Error(POLICY_URL);
        }
        return response.json();
      }),
    ])
      .then(([csv, loadedPolicy]) => {
        if (cancelled) {
          return;
        }
        applySampleKeyframesText(csv);
        setPolicy({ ...DEFAULT_POLICY, ...loadedPolicy });
      })
      .catch(() => {
        if (!cancelled) {
          setDataStatus("load error");
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const fetchOnce = () => {
      Promise.all([
        fetch(SAMPLE_KEYFRAME_URL, { cache: "no-store" }).then((response) => (response.ok ? response.text() : "")),
        fetch(RUNTIME_ANCHORS_URL, { cache: "no-store" }).then((response) => (response.ok ? response.text() : "")),
        fetch(SEGMENTS_URL, { cache: "no-store" }).then((response) => (response.ok ? response.text() : "")),
        fetch(RESULT_URL, { cache: "no-store" }).then((response) => (response.ok ? response.text() : "")),
      ])
        .then(([sampleText, anchorText, segmentText, resultText]) => {
          if (cancelled) {
            return;
          }
          if (sampleText) {
            applySampleKeyframesText(sampleText);
          }
          if (anchorText) {
            applyRuntimeAnchorsText(anchorText);
          }
          if (segmentText) {
            applySegmentsText(segmentText);
          }
          if (resultText) {
            applyResultText(resultText);
          }
        })
        .catch(() => {});
    };

    fetchOnce();
    if (!window.EventSource) {
      setSequenceStatus("sse unavailable");
      return () => {
        cancelled = true;
      };
    }

    const events = new EventSource("/demo/events");
    events.addEventListener("open", () => setSequenceStatus("sse connected"));
    events.addEventListener("ready", () => setSequenceStatus("sse connected"));
    events.addEventListener("sample_keyframes", (event) => {
      if (!cancelled) {
        applySampleKeyframesText(JSON.parse(event.data));
      }
    });
    events.addEventListener("runtime_anchors", (event) => {
      if (!cancelled) {
        applyRuntimeAnchorsText(JSON.parse(event.data));
      }
    });
    events.addEventListener("policy", (event) => {
      if (!cancelled) {
        applyPolicyText(JSON.parse(event.data));
      }
    });
    events.addEventListener("prediction_segments", (event) => {
      if (!cancelled) {
        applySegmentsText(JSON.parse(event.data));
      }
    });
    events.addEventListener("result", (event) => {
      if (!cancelled) {
        applyResultText(JSON.parse(event.data));
      }
    });
    events.onerror = () => {
      if (!cancelled) {
        setSequenceStatus("sse reconnecting");
      }
    };
    return () => {
      cancelled = true;
      events.close();
    };
  }, [playMode]);

  useEffect(() => {
    if (!running || keyframes.length === 0 || !frameRef.current) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      if (playMode === PLAY_MODES.ANCHORS) {
        return;
      }

      const segments = predictionSegmentsRef.current;
      if (segments.length > 0) {
        const now = performance.now();
        let playback = segmentPlaybackRef.current;
        let segment = segments[playback.segmentIndex] || segments[0];
        if (segment.frames.length === 0) {
          return;
        }
        const segmentDuration = segmentDurationMs(segment);
        let elapsed = now - playback.startTime;
        while (elapsed >= segmentDuration) {
          if (playback.segmentIndex >= segments.length - 1) {
            const lastFrameIndex = segment.frames.length - 1;
            if (playback.lastFrameIndex !== lastFrameIndex) {
              const nextFrame = segment.frames[lastFrameIndex];
              const previous = frameRef.current;
              const next = makeFrameState(nextFrame, previous, sequenceResult);
              next.anchorLoop = 1;
              frameRef.current = next;
              if (now - lastUiUpdateRef.current >= UI_UPDATE_MS) {
                lastUiUpdateRef.current = now;
                setFrame(next);
              }
              segmentPlaybackRef.current = { ...playback, lastFrameIndex };
            }
            return;
          }
          const nextSegmentIndex = playback.segmentIndex + 1;
          const overflow = elapsed - segmentDuration;
          playback = { segmentIndex: nextSegmentIndex, startTime: now - overflow, lastFrameIndex: -1 };
          segmentPlaybackRef.current = playback;
          segment = segments[nextSegmentIndex];
          if (segment.frames.length === 0) {
            return;
          }
          const nextDuration = segmentDurationMs(segment);
          elapsed = overflow;
          if (elapsed < nextDuration) {
            break;
          }
        }
        const ratio = Math.max(0, Math.min(elapsed / segmentDuration, 1));
        const frameIndex = Math.min(segment.frames.length - 1, Math.floor(ratio * segment.frames.length));
        if (frameIndex === playback.lastFrameIndex) {
          return;
        }
        segmentPlaybackRef.current = { ...playback, lastFrameIndex: frameIndex };
        const nextFrame = segment.frames[frameIndex];
        const previous = frameRef.current;
        const next = makeFrameState(nextFrame, previous, sequenceResult);
        next.anchorLoop = 1;
        frameRef.current = next;
        if (now - lastUiUpdateRef.current >= UI_UPDATE_MS) {
          lastUiUpdateRef.current = now;
          setFrame(next);
        }
      }
    }, RENDER_MS);
    return () => window.clearInterval(timer);
  }, [keyframes, playMode, policy, running, selectedKeyframeIndex, sequenceFrames, sequenceResult]);

  useEffect(() => {
    if (playMode === PLAY_MODES.ANCHORS) {
      setRunning(false);
    }
  }, [playMode]);

  function resetDemo() {
    if (keyframes.length === 0) {
      return;
    }
    frameRef.current = frameFromKeyframe(keyframes[0], 0);
    setSelectedKeyframeIndex(0);
    segmentPlaybackRef.current = { segmentIndex: 0, startTime: performance.now(), lastFrameIndex: -1 };
    setFrame(frameRef.current);
  }

  function startPlayback() {
    if (playMode !== PLAY_MODES.ANCHORS) {
      const segments = predictionSegmentsRef.current;
      if (segments.length > 0) {
        const now = performance.now();
        const playback = segmentPlaybackRef.current;
        const segment = segments[playback.segmentIndex] || segments[0];
        const isAtEnd = segment && playback.lastFrameIndex >= segment.frames.length - 1 && playback.segmentIndex >= segments.length - 1;
        if (isAtEnd) {
          segmentPlaybackRef.current = { segmentIndex: 0, startTime: now, lastFrameIndex: -1 };
        } else {
          segmentPlaybackRef.current = resumePlaybackAtCurrentFrame({ playback, segment, now });
        }
      }
    }
    setRunning(true);
  }

  function togglePlayback() {
    if (running) {
      setRunning(false);
      return;
    }
    startPlayback();
  }

  function showPredictionForAnchor(index) {
    if (!keyframes[index]) {
      return;
    }
    const segments = predictionSegmentsRef.current;
    const { segmentIndex, segment, frame: manualFrame } = predictionFrameForAnchor({
      keyframes,
      segments,
      index,
      previousFrame: frameRef.current,
      sequenceResult,
    });
    setRunning(false);
    setPlayMode(PLAY_MODES.PREDICTION);
    setSelectedKeyframeIndex(index);
    if (segmentIndex >= 0 && segment?.frames.length) {
      segmentPlaybackRef.current = { segmentIndex, startTime: performance.now(), lastFrameIndex: 0 };
      setExpandedSegments((current) => ({ ...current, [segment.key]: true }));
    }
    if (manualFrame) {
      frameRef.current = manualFrame;
      setFrame(frameRef.current);
    }
  }

  function showKeyframe(index) {
    if (!keyframes[index]) {
      return;
    }
    if (playMode !== PLAY_MODES.ANCHORS) {
      showPredictionForAnchor(index);
      return;
    }
    setRunning(false);
    setPlayMode(PLAY_MODES.ANCHORS);
    setSelectedKeyframeIndex(index);
    const manualFrame = anchorFrameAt(keyframes, index);
    if (manualFrame) {
      frameRef.current = manualFrame;
      setFrame(frameRef.current);
    }
  }

  function switchPlaybackMode(mode) {
    if (mode === PLAY_MODES.ANCHORS) {
      setRunning(false);
      const manualFrame = anchorFrameAt(keyframes, selectedKeyframeIndex);
      if (manualFrame) {
        frameRef.current = manualFrame;
        setFrame(frameRef.current);
      }
    }
    setPlayMode(mode);
  }

  const realtimeMode = playMode === PLAY_MODES.REALTIME;
  const sequenceMode = playMode !== PLAY_MODES.ANCHORS;
  const predictionSegments = sequenceSegments;

  useEffect(() => {
    const playableSegments = predictionSegments.filter((segment) => segment.frames.length > 0);
    const previousCount = playableSegmentCountRef.current;
    const previousLatestKey = latestPlayableSegmentKeyRef.current;
    const latestSegment = playableSegments[playableSegments.length - 1];
    const latestKey = latestSegment?.key ?? "";
    predictionSegmentsRef.current = playableSegments;
    playableSegmentCountRef.current = playableSegments.length;
    latestPlayableSegmentKeyRef.current = latestKey;
    if (playableSegments.length === 0) {
      return;
    }
    if (sequenceMode && running && latestKey && latestKey !== previousLatestKey) {
      const latestIndex = playableSegments.length - 1;
      segmentPlaybackRef.current = { segmentIndex: latestIndex, startTime: performance.now(), lastFrameIndex: -1 };
      setExpandedSegments({ [playableSegments[latestIndex].key]: true });
      const firstFrame = playableSegments[latestIndex].frames[0];
      if (firstFrame) {
        frameRef.current = makeFrameState(firstFrame, frameRef.current, sequenceResult);
        setFrame(frameRef.current);
      }
      return;
    }
    if (playableSegments.length > previousCount && previousCount > 0) {
      const playback = segmentPlaybackRef.current;
      const currentSegment = playableSegments[playback.segmentIndex];
      if (currentSegment && playback.segmentIndex === previousCount - 1 && playback.lastFrameIndex >= currentSegment.frames.length - 1) {
        segmentPlaybackRef.current = { segmentIndex: playback.segmentIndex + 1, startTime: performance.now(), lastFrameIndex: -1 };
        return;
      }
    }
    if (segmentPlaybackRef.current.segmentIndex >= playableSegments.length) {
      segmentPlaybackRef.current = { segmentIndex: 0, startTime: performance.now(), lastFrameIndex: -1 };
    }
  }, [predictionSegments, realtimeMode, running, sequenceMode, sequenceResult]);

  const frameKeyframeIndex = frameKeyframeIndexForDisplay(keyframes, frame);
  const activeSegmentIndex = activeSegmentIndexForFrame(predictionSegments, frame);
  const activeSegment = predictionSegments[activeSegmentIndex];
  const { index: activeSegmentFrameIndex, isPlaying: activeSegmentIsPlaying } = activeFrameIndexForSegment(activeSegment, frame);
  const activeSegmentProgress = activeSegment && activeSegment.frames.length > 0 && activeSegmentIsPlaying ? Math.min(100, Math.round(((activeSegmentFrameIndex + 1) / activeSegment.frames.length) * 100)) : 0;
  const keyframeIndexById = useMemo(() => new Map(keyframes.map((item, index) => [item.frame_id, index])), [keyframes]);
  const currentRuntimeAnchorIndex = currentRuntimeAnchorIndexForDisplay({ realtimeMode, keyframes, activeSegment, frame, selectedKeyframeIndex });
  const currentRuntimeAnchor = keyframes[currentRuntimeAnchorIndex] || keyframes[0];
  const visibleRuntimeAnchors = realtimeMode && currentRuntimeAnchor ? [currentRuntimeAnchor] : keyframes;
  const latestReceivedAnchorIndex = Math.max(0, keyframes.length - 1);
  const predictionLag = realtimeMode ? Math.max(0, latestReceivedAnchorIndex - currentRuntimeAnchorIndex) : 0;
  const activeKeyframeIndex = realtimeMode
    ? currentRuntimeAnchorIndex
    : sequenceMode
    ? Math.max(0, keyframeIndexById.get(activeSegment?.from.frame_id) ?? keyframeIndexById.get(activeSegment?.to.frame_id) ?? frameKeyframeIndex)
    : frameKeyframeIndex;

  useLayoutEffect(() => {
    const scroller = keyframeScrollRef.current;
    const activeRow = activeKeyframeRowRef.current;
    if (scroller && activeRow) {
      const scrollerRect = scroller.getBoundingClientRect();
      const rowRect = activeRow.getBoundingClientRect();
      const rowCenterInScroller = rowRect.top - scrollerRect.top + rowRect.height / 2;
      const targetTop = scroller.scrollTop + rowCenterInScroller - scroller.clientHeight / 2;
      scroller.scrollTop = Math.max(0, Math.min(targetTop, scroller.scrollHeight - scroller.clientHeight));
    }
  }, [activeKeyframeIndex, playMode, expandedSegments, sequenceFrames.length]);

  if (!frame || keyframes.length === 0) {
    return (
      <main className="app-shell">
        <section className="hero">
          <div>
            <p>single palm keyframes / loaded device stream / loaded prediction policy</p>
            <h1>Hand Prediction Demo</h1>
          </div>
        </section>
        <section className="loading-state">{dataStatus}</section>
      </main>
    );
  }

  const target = sequenceMode
    ? { frame_id: frame.target_frame || "sequence", grip: frame.grip, tolerance: 0.001 }
    : keyframes[frame.targetIndex] || keyframes[0];
  const predictedGap = Math.floor(ANCHOR_MS / RENDER_MS);
  const sequenceCsvRows = ["frame_t_ms,target_frame,palm_x,palm_y,palm_z,yaw,pitch,roll,grip"].concat(sequenceFrames.map(formatPredictionCsvRow));
  const liveRows = [
    ["frame_t_ms", Number(frame.frame_t_ms).toFixed(3).replace(/\.000$/, "")],
    ["target", target.frame_id],
    ["palm_x", frame.x.toFixed(4)],
    ["palm_y", frame.y.toFixed(4)],
    ["palm_z", frame.z.toFixed(4)],
    ["yaw", frame.yaw.toFixed(3)],
    ["pitch", frame.pitch.toFixed(3)],
    ["roll", frame.roll.toFixed(3)],
    ["grip", frame.grip.toFixed(3)],
    ["vx", frame.vx.toFixed(3)],
    ["vy", frame.vy.toFixed(3)],
    ["vz", frame.vz.toFixed(3)],
    ["error", frame.error.toFixed(4)],
    ["confidence", frame.confidence.toFixed(3)],
  ];
  const policyRows = [
    ["source", sequenceMode ? "implement segments" : "keyframe script"],
    ["frames", sequenceMode ? sequenceFrames.length : keyframes.length],
    ["status", sequenceStatus],
    ["state", sequenceResult?.state ?? "-"],
    ["success", sequenceResult ? String(Boolean(sequenceResult.success)) : "-"],
    ["anchors", sequenceResult?.anchors_seen ?? keyframes.length],
    ["samples", sampleKeyframes.length],
    ["segments", sequenceResult?.segments_written ?? predictionSegments.length],
    ["bootstrap", sequenceResult?.bootstrap_segments ?? "-"],
    ["confirmed", sequenceResult?.confirmed_segments ?? "-"],
    ["correction", sequenceResult?.correction_segments ?? "-"],
    ["error", Number(sequenceResult?.last_error ?? frame.error).toFixed(5)],
    ["jump", Number(sequenceResult?.max_position_jump ?? Math.hypot(frame.vx, frame.vy, frame.vz)).toFixed(4)],
  ];
  const currentRuntimeRows = currentRuntimeAnchor
    ? [
        ["anchor", currentRuntimeAnchor.anchor_id || currentRuntimeAnchor.frame_id],
        ["t_ms", currentRuntimeAnchor.t_ms],
        ["source", currentRuntimeAnchor.source],
        ["grip", currentRuntimeAnchor.grip.toFixed(3)],
        ["confidence", currentRuntimeAnchor.confidence.toFixed(3)],
        ["jitter", currentRuntimeAnchor.jitter.toFixed(5)],
        ["io lag", predictionLag],
      ]
    : [];
  const {
    start: activePredictionWindowStart,
    end: activePredictionWindowEnd,
    frames: visibleActivePredictionFrames,
  } = predictionFrameWindow(activeSegment, activeSegmentFrameIndex, PREDICTION_WINDOW_BEFORE, PREDICTION_WINDOW_AFTER);

  const toggleSegment = (key) => {
    setExpandedSegments((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p>single palm keyframes / loaded device stream / loaded prediction policy</p>
          <h1>Hand Prediction Demo</h1>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={togglePlayback} title={running ? "Pause" : "Play"}>
            {running ? <Pause size={18} /> : <Play size={18} />}
            <span>{running ? "Pause" : "Play"}</span>
          </button>
          <button type="button" onClick={resetDemo} title="Reset demo">
            <RotateCcw size={18} />
            <span>Reset</span>
          </button>
        </div>
      </section>

      <section className="stage-row">
        <HandScene frame={frame} ready={Boolean(frame && keyframes.length > 0)} />
        <aside className="control-panel">
          <div className="status-strip">
            <div>
              <span>simul</span>
              <strong>{ANCHOR_MS}ms</strong>
            </div>
            <div>
              <span>implement</span>
              <strong>{`${RENDER_MS}ms`}</strong>
            </div>
            <div>
              <span>fill</span>
              <strong>{sequenceMode ? `${sequenceFrames.length} live` : `${predictedGap}/gap`}</strong>
            </div>
          </div>

          <div className="source-strip">
            <span>{RUNTIME_ANCHORS_URL}</span>
            <span>{sequenceMode ? SEGMENTS_URL : POLICY_URL}</span>
          </div>

          <div className="playback-panel">
            <div className="mode-toggle" role="group" aria-label="playback mode">
              {TAB_CONTRACTS.map((tab) => (
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
            {!realtimeMode ? <div className="keyframe-picker">
              <button type="button" onClick={() => showKeyframe((selectedKeyframeIndex - 1 + keyframes.length) % keyframes.length)} title="Previous keyframe">
                <ChevronLeft size={16} />
              </button>
              <select value={selectedKeyframeIndex} onChange={(event) => showKeyframe(Number(event.target.value))}>
                {keyframes.map((item, index) => (
                  <option value={index} key={item.frame_id}>
                    {String(index).padStart(2, "0")} {item.frame_id}
                  </option>
                ))}
              </select>
              <button type="button" onClick={() => showKeyframe((selectedKeyframeIndex + 1) % keyframes.length)} title="Next keyframe">
                <ChevronRight size={16} />
              </button>
            </div> : null}
          </div>

          {realtimeMode ? (
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
          ) : null}

          {realtimeMode ? (
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
          ) : null}

          <div className="current-prediction">
            <div className="timeline-head">
              <span>{realtimeMode ? "prediction for current keyframe" : "current prediction"}</span>
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

          {realtimeMode ? (
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
          ) : null}

          <div className="script-panels">
            {!realtimeMode ? <div className="script-panel">
              <div className="timeline-head">
                <span>{realtimeMode ? "current runtime io" : "runtime io anchors"}</span>
                <strong>
                  {realtimeMode ? `${currentRuntimeAnchorIndex + 1}/${keyframes.length}` : `${activeKeyframeIndex + 1}/${keyframes.length}`}
                </strong>
              </div>
              <div className="script-window keyframe-window" ref={keyframeScrollRef}>
                {visibleRuntimeAnchors.map((item) => {
                  const keyframeIndex = keyframes.findIndex((anchor) => anchor.anchor_id === item.anchor_id || anchor.frame_id === item.frame_id);
                  const segmentsForKeyframe = predictionSegments.filter(
                    (segment) =>
                      segment.from.frame_id === item.frame_id ||
                      segment.to.frame_id === item.frame_id ||
                      segment.fromAnchor.anchor_id === item.anchor_id ||
                      segment.toAnchor.anchor_id === item.anchor_id ||
                      (segment.segmentType === "correction" && segment.to.frame_id === item.frame_id)
                  ).filter((segment) => !realtimeMode || segment.segmentIndex === activeSegment?.segmentIndex);
                  const isActive = keyframeIndex === activeKeyframeIndex;
                  return (
                    <div className={isActive ? "keyframe-script-group active" : "keyframe-script-group"} key={item.frame_id}>
                      <button type="button" className={isActive ? "keyframe active" : "keyframe"} onClick={() => showKeyframe(keyframeIndex)} ref={isActive ? activeKeyframeRowRef : null}>
                        <span>{item.t_ms}</span>
                        <strong>{item.frame_id}</strong>
                        <em>{item.grip.toFixed(2)}</em>
                      </button>
                      {sequenceMode
                        ? segmentsForKeyframe.map((segment) => {
                            const isOpen = Boolean(expandedSegments[segment.key]);
                            const isActiveSegment = segment.segmentIndex === activeSegment?.segmentIndex;
                            const segmentActiveIndex = Math.max(0, segment.frames.findIndex((prediction) => prediction.csvLine === frame.csvLine));
                            const windowStart = isActiveSegment ? Math.max(0, segmentActiveIndex - PREDICTION_WINDOW_BEFORE) : 0;
                            const windowEnd = isActiveSegment ? Math.min(segment.frames.length, segmentActiveIndex + PREDICTION_WINDOW_AFTER + 1) : Math.min(segment.frames.length, VISIBLE_ROW_LIMIT);
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
                          })
                        : null}
                    </div>
                  );
                })}
              </div>
              <div className="window-range">
                segment {predictionSegments.length ? activeSegmentIndex + 1 : 0}/{predictionSegments.length}: {activeSegment?.segmentType ?? "-"} {activeSegment?.from.frame_id ?? "-"} - {activeSegment?.to.frame_id ?? "-"}
              </div>
            </div> : null}
            {!realtimeMode ? <div className="script-panel">
              <div className="timeline-head">
                <span>reference samples</span>
                <strong>{sampleKeyframes.length}</strong>
              </div>
              <div className="script-window keyframe-window">
                {sampleKeyframes.slice(0, VISIBLE_ROW_LIMIT).map((item, index) => (
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
            </div> : null}
          </div>

          <div className="live-grid">
            {liveRows.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

          <div className="policy-grid">
            {policyRows.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value}</strong>
              </div>
            ))}
          </div>

        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
