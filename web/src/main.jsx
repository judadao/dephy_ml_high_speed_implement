import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { AnchorsTab } from "./AnchorsTab.jsx";
import { DemoHeader } from "./DemoHeader.jsx";
import { HandScene } from "./HandScene.jsx";
import { MetricsPanels } from "./MetricsPanels.jsx";
import { PlaybackToolbar } from "./PlaybackToolbar.jsx";
import { PredictionTab } from "./PredictionTab.jsx";
import { RealtimeDemoTab } from "./RealtimeDemoTab.jsx";
import { activeFrameIndexForSegment, activeSegmentIndexForFrame, currentRuntimeAnchorIndexForDisplay, frameKeyframeIndexForDisplay, predictionFrameWindow } from "./demoDisplay.js";
import { ANCHOR_MS, DEFAULT_POLICY, DEMO_RECORD_LIMIT, KEYFRAME_URL, PLAY_MODES, POLICY_URL, PREDICTION_WINDOW_AFTER, PREDICTION_WINDOW_BEFORE, RENDER_MS, RESULT_URL, RUNTIME_ANCHORS_URL, SAMPLE_KEYFRAME_URL, SEGMENTS_URL, TAB_CONTRACTS, UI_UPDATE_MS, VISIBLE_ROW_LIMIT } from "./demoConstants.js";
import { flattenPredictionSegments, formatPredictionCsvRow, frameFromKeyframe, makeFrameState, parseCsv, parsePredictionSegmentsJsonl, parseRuntimeAnchorsJsonl } from "./demoData.js";
import { anchorFrameAt, predictionFrameForAnchor } from "./manualPlayback.js";
import { clampKeyframeIndex, keyframesForMode, nextAnchorPlayback, nextSegmentPlayback, shouldRunPlayback, startPlaybackState } from "./playbackController.js";
import { connectDemoEvents, fetchInitialDemoData } from "./demoTransport.js";
import { buildSamplePredictionSegments } from "./samplePredictionSegments.js";
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
  const keyframesRef = useRef([]);
  const sequenceResultRef = useRef(null);
  const [dataStatus, setDataStatus] = useState("loading");
  const frameRef = useRef(null);
  const anchorPlaybackRef = useRef({ index: 0, lastTick: 0 });
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
  const playbackReady = Boolean(frame);

  const keyframes = runtimeAnchors;
  const reviewKeyframes = keyframesForMode({ playMode, liveKeyframes: keyframes, sampleKeyframes });
  const predictionMode = playMode === PLAY_MODES.PREDICTION;
  const realtimeMode = playMode === PLAY_MODES.REALTIME;
  const samplePredictionSegments = useMemo(() => buildSamplePredictionSegments(sampleKeyframes, 100), [sampleKeyframes]);
  const displaySegments = predictionMode ? samplePredictionSegments : sequenceSegments;
  const displayFrames = useMemo(() => flattenPredictionSegments(displaySegments), [displaySegments]);

  useEffect(() => {
    keyframesRef.current = keyframes;
  }, [keyframes]);

  useEffect(() => {
    sequenceResultRef.current = sequenceResult;
  }, [sequenceResult]);

  function applySampleKeyframesText(csv) {
    if (csv === keyframeCsvRef.current) {
      return;
    }
    const loadedKeyframes = parseCsv(csv);
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
    setSelectedKeyframeIndex((current) => (playMode === PLAY_MODES.ANCHORS ? current : clampKeyframeIndex(current, loadedAnchors)));
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
      fetchInitialDemoData({
        urls: {
          sampleKeyframes: SAMPLE_KEYFRAME_URL,
          runtimeAnchors: RUNTIME_ANCHORS_URL,
          predictionSegments: SEGMENTS_URL,
          result: RESULT_URL,
        },
        onSampleKeyframes: (text) => {
          if (cancelled) {
            return;
          }
          applySampleKeyframesText(text);
        },
        onRuntimeAnchors: (text) => {
          if (cancelled) {
            return;
          }
          applyRuntimeAnchorsText(text);
        },
        onPredictionSegments: (text) => {
          if (cancelled) {
            return;
          }
          applySegmentsText(text);
        },
        onResult: (text) => {
          if (cancelled) {
            return;
          }
          applyResultText(text);
        },
      }).catch(() => {});
    };

    const events = connectDemoEvents({
      onSampleKeyframes: (text) => {
        if (!cancelled) {
          applySampleKeyframesText(text);
        }
      },
      onRuntimeAnchors: (text) => {
        if (!cancelled) {
          applyRuntimeAnchorsText(text);
        }
      },
      onPolicy: (text) => {
        if (!cancelled) {
          applyPolicyText(text);
        }
      },
      onPredictionSegments: (text) => {
        if (!cancelled) {
          applySegmentsText(text);
        }
      },
      onResult: (text) => {
        if (!cancelled) {
          applyResultText(text);
        }
      },
      onStatus: (status) => {
        if (!cancelled) {
          setSequenceStatus(status);
        }
      },
    });
    if (!events) {
      fetchOnce();
    }
    return () => {
      cancelled = true;
      events?.close();
    };
  }, [playMode]);

  useEffect(() => {
    if (!shouldRunPlayback({ playMode, running, playbackReady })) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      const sourceKeyframes = playMode === PLAY_MODES.ANCHORS ? reviewKeyframes : keyframesRef.current;
      if (sourceKeyframes.length === 0) {
        return;
      }
      if (playMode === PLAY_MODES.ANCHORS) {
        const now = performance.now();
        const advanced = nextAnchorPlayback({
          keyframes: sourceKeyframes,
          currentIndex: anchorPlaybackRef.current.index,
          now,
          lastTick: anchorPlaybackRef.current.lastTick,
          sampleMs: ANCHOR_MS,
        });
        if (!advanced) {
          return;
        }
        anchorPlaybackRef.current = { index: advanced.index, lastTick: advanced.lastTick };
        setSelectedKeyframeIndex(advanced.index);
        frameRef.current = frameFromKeyframe(advanced.keyframe, advanced.index);
        setFrame(frameRef.current);
        return;
      }
      const segments = predictionSegmentsRef.current;
      if (segments.length > 0) {
        const now = performance.now();
        const advanced = nextSegmentPlayback({ segments, playback: segmentPlaybackRef.current, now });
        segmentPlaybackRef.current = advanced.playback;
        if (!advanced.frame) {
          return;
        }
        const previous = frameRef.current;
        const next = makeFrameState(advanced.frame, previous, sequenceResultRef.current);
        next.anchorLoop = 1;
        frameRef.current = next;
        if (now - lastUiUpdateRef.current >= UI_UPDATE_MS) {
          lastUiUpdateRef.current = now;
          setFrame(next);
        }
      }
    }, RENDER_MS);
    return () => window.clearInterval(timer);
  }, [playMode, running, playbackReady]);

  useEffect(() => {
    if (playMode === PLAY_MODES.ANCHORS) {
      setRunning(false);
    }
  }, [playMode]);

  function resetDemo() {
    const sourceKeyframes = playMode === PLAY_MODES.ANCHORS || predictionMode ? reviewKeyframes : keyframes;
    if (sourceKeyframes.length === 0) {
      return;
    }
    frameRef.current = frameFromKeyframe(sourceKeyframes[0], 0);
    setSelectedKeyframeIndex(0);
    anchorPlaybackRef.current = { index: 0, lastTick: 0 };
    segmentPlaybackRef.current = { segmentIndex: 0, startTime: performance.now(), lastFrameIndex: -1 };
    setFrame(frameRef.current);
  }

  function startPlayback() {
    const segments = predictionSegmentsRef.current;
    const now = performance.now();
    const playback = segmentPlaybackRef.current;
    const segment = segments[playback.segmentIndex] || segments[0];
    const next = startPlaybackState({ playMode, playback, segment, segmentCount: segments.length, now });
    segmentPlaybackRef.current = next.playback;
    if (playMode === PLAY_MODES.ANCHORS) {
      anchorPlaybackRef.current = { index: clampKeyframeIndex(selectedKeyframeIndex, reviewKeyframes), lastTick: 0 };
    }
    setRunning(next.running);
    if (!next.running) {
      return;
    }
    if (segments.length > 0) {
      lastUiUpdateRef.current = 0;
    }
  }

  function togglePlayback() {
    if (running) {
      setRunning(false);
      return;
    }
    startPlayback();
  }

  function showPredictionForAnchor(index) {
    const sourceKeyframes = reviewKeyframes;
    if (!sourceKeyframes[index]) {
      return;
    }
    const segments = predictionSegmentsRef.current;
    const { segmentIndex, segment, frame: manualFrame } = predictionFrameForAnchor({
      keyframes: sourceKeyframes,
      segments,
      index,
      previousFrame: frameRef.current,
      sequenceResult,
    });
    setRunning(false);
    setPlayMode(PLAY_MODES.PREDICTION);
    setSelectedKeyframeIndex(index);
    anchorPlaybackRef.current = { index, lastTick: 0 };
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
    const sourceKeyframes = playMode === PLAY_MODES.ANCHORS || predictionMode ? reviewKeyframes : keyframes;
    if (!sourceKeyframes[index]) {
      return;
    }
    if (playMode !== PLAY_MODES.ANCHORS) {
      showPredictionForAnchor(index);
      return;
    }
    setRunning(false);
    setPlayMode(PLAY_MODES.ANCHORS);
    setSelectedKeyframeIndex(index);
    const manualFrame = anchorFrameAt(sourceKeyframes, index);
    if (manualFrame) {
      frameRef.current = manualFrame;
      setFrame(frameRef.current);
    }
  }

  function switchPlaybackMode(mode) {
    if (mode === PLAY_MODES.ANCHORS) {
      setRunning(false);
      const reviewIndex = clampKeyframeIndex(selectedKeyframeIndex, sampleKeyframes);
      setSelectedKeyframeIndex(reviewIndex);
      const manualFrame = anchorFrameAt(sampleKeyframes, reviewIndex);
      if (manualFrame) {
        anchorPlaybackRef.current = { index: reviewIndex, lastTick: 0 };
        frameRef.current = manualFrame;
        setFrame(frameRef.current);
      }
    }
    setPlayMode(mode);
  }

  const sequenceMode = playMode !== PLAY_MODES.ANCHORS;
  const predictionSegments = displaySegments;

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
    if (realtimeMode && running && latestKey && latestKey !== previousLatestKey) {
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

  const frameKeyframeIndex = frameKeyframeIndexForDisplay(reviewKeyframes, frame);
  const activeSegmentIndex = activeSegmentIndexForFrame(predictionSegments, frame);
  const activeSegment = predictionSegments[activeSegmentIndex];
  const { index: activeSegmentFrameIndex, isPlaying: activeSegmentIsPlaying } = activeFrameIndexForSegment(activeSegment, frame);
  const activeSegmentProgress = activeSegment && activeSegment.frames.length > 0 && activeSegmentIsPlaying ? Math.min(100, Math.round(((activeSegmentFrameIndex + 1) / activeSegment.frames.length) * 100)) : 0;
  const keyframeIndexById = useMemo(() => new Map(reviewKeyframes.map((item, index) => [item.frame_id, index])), [reviewKeyframes]);
  const currentRuntimeAnchorIndex = currentRuntimeAnchorIndexForDisplay({ realtimeMode, keyframes, activeSegment, frame, selectedKeyframeIndex });
  const currentRuntimeAnchor = keyframes[currentRuntimeAnchorIndex] || keyframes[0];
  const visibleRuntimeAnchors = realtimeMode && currentRuntimeAnchor ? [currentRuntimeAnchor] : reviewKeyframes;
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
  }, [activeKeyframeIndex, playMode, expandedSegments, displayFrames.length]);

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
    : reviewKeyframes[frame.targetIndex] || reviewKeyframes[0] || keyframes[0];
  const predictedGap = Math.floor(ANCHOR_MS / RENDER_MS);
  const sequenceCsvRows = ["frame_t_ms,target_frame,palm_x,palm_y,palm_z,yaw,pitch,roll,grip"].concat(displayFrames.map(formatPredictionCsvRow));
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
    ["frames", sequenceMode ? displayFrames.length : keyframes.length],
    ["status", sequenceStatus],
    ["state", sequenceResult?.state ?? "-"],
    ["success", sequenceResult ? String(Boolean(sequenceResult.success)) : "-"],
    ["anchors", sequenceResult?.anchors_seen ?? keyframes.length],
    ["samples", sampleKeyframes.length],
    ["segments", predictionSegments.length],
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
  const { frames: visibleActivePredictionFrames } = predictionFrameWindow(activeSegment, activeSegmentFrameIndex, PREDICTION_WINDOW_BEFORE, PREDICTION_WINDOW_AFTER);

  const toggleSegment = (key) => {
    setExpandedSegments((current) => ({ ...current, [key]: !current[key] }));
  };

  return (
    <main className="app-shell">
      <DemoHeader playMode={playMode} running={running} onReset={resetDemo} onTogglePlayback={togglePlayback} />

      <section className="stage-row">
        <HandScene frame={frame} ready={Boolean(frame && keyframes.length > 0)} />
        <aside className="control-panel">
          <PlaybackToolbar
            anchorMs={ANCHOR_MS}
            keyframes={playMode === PLAY_MODES.ANCHORS || predictionMode ? reviewKeyframes : keyframes}
            onSelectKeyframe={showKeyframe}
            playMode={playMode}
            policyUrl={POLICY_URL}
            predictedGap={predictedGap}
            realtimeMode={realtimeMode}
            renderMs={RENDER_MS}
            runtimeAnchorsUrl={RUNTIME_ANCHORS_URL}
            segmentUrl={SEGMENTS_URL}
            selectedKeyframeIndex={selectedKeyframeIndex}
            sequenceFrames={displayFrames}
            sequenceMode={sequenceMode}
            switchPlaybackMode={switchPlaybackMode}
            tabContracts={TAB_CONTRACTS}
          />

          {realtimeMode ? (
            <RealtimeDemoTab
              activeSegment={activeSegment}
              activeSegmentFrameIndex={activeSegmentFrameIndex}
              activeSegmentIndex={activeSegmentIndex}
              activeSegmentIsPlaying={activeSegmentIsPlaying}
              activeSegmentProgress={activeSegmentProgress}
              currentRuntimeAnchor={currentRuntimeAnchor}
              currentRuntimeAnchorIndex={currentRuntimeAnchorIndex}
              currentRuntimeRows={currentRuntimeRows}
              frame={frame}
              keyframes={keyframes}
              latestReceivedAnchorIndex={latestReceivedAnchorIndex}
              predictionLag={predictionLag}
              predictionSegments={predictionSegments}
              sequenceCsvRows={sequenceCsvRows}
              visibleActivePredictionFrames={visibleActivePredictionFrames}
            />
          ) : playMode === PLAY_MODES.PREDICTION ? (
            <PredictionTab
              activeKeyframeIndex={activeKeyframeIndex}
              activeKeyframeRowRef={activeKeyframeRowRef}
              activeSegment={activeSegment}
              activeSegmentFrameIndex={activeSegmentFrameIndex}
              activeSegmentIndex={activeSegmentIndex}
              activeSegmentIsPlaying={activeSegmentIsPlaying}
              activeSegmentProgress={activeSegmentProgress}
              expandedSegments={expandedSegments}
              frame={frame}
              keyframeScrollRef={keyframeScrollRef}
              keyframes={reviewKeyframes}
              predictionSegments={predictionSegments}
              sampleKeyframes={sampleKeyframes}
              sequenceCsvRows={sequenceCsvRows}
              showKeyframe={showKeyframe}
              toggleSegment={toggleSegment}
              visibleKeyframes={reviewKeyframes}
              visibleRowLimit={VISIBLE_ROW_LIMIT}
              windowAfter={PREDICTION_WINDOW_AFTER}
              windowBefore={PREDICTION_WINDOW_BEFORE}
            />
          ) : (
            <AnchorsTab
              activeKeyframeIndex={activeKeyframeIndex}
              activeKeyframeRowRef={activeKeyframeRowRef}
              keyframeScrollRef={keyframeScrollRef}
              keyframes={reviewKeyframes}
              showKeyframe={showKeyframe}
              visibleKeyframes={reviewKeyframes}
            />
          )}

          <MetricsPanels liveRows={liveRows} policyRows={policyRows} />
        </aside>
      </section>
    </main>
  );
}

createRoot(document.getElementById("root")).render(<App />);
