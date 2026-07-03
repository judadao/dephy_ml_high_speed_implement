import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChevronDown, ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildHandJoints, FINGER_JOINTS, FINGERS, HAND_SCALE, SCENE_Y_OFFSET } from "./handRig.js";
import "./styles.css";

const SAMPLE_KEYFRAME_URL = "/demo/sample_keyframes.csv";
const KEYFRAME_URL = SAMPLE_KEYFRAME_URL;
const RUNTIME_ANCHORS_URL = "/demo/runtime_anchors.jsonl";
const POLICY_URL = "/demo/hand_policy.json";
const SEGMENTS_URL = "/demo/hand_sequence/prediction_segments.jsonl";
const RESULT_URL = "/demo/hand_sequence/result.json";
const RENDER_MS = 16;
const ANCHOR_MS = 300;
const PREDICTION_WINDOW_BEFORE = 36;
const PREDICTION_WINDOW_AFTER = 36;
const DEFAULT_POLICY = {
  format: "dephy_hand_policy_v1",
  kp_pos: 8.5,
  kd_pos: 2.1,
  kp_rot: 3.2,
  kp_grip: 4.0,
  speed_scale: 0.82,
};

function parseCsv(text) {
  if (!text.trim()) {
    return [];
  }
  const [headerLine, ...rows] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return rows.map((row) => {
    const values = row.split(",");
    const item = Object.fromEntries(headers.map((key, index) => [key, values[index]]));
    return {
      frame_id: item.frame_id,
      t_ms: Number(item.t_ms),
      x: Number(item.x),
      y: Number(item.y),
      z: Number(item.z),
      yaw: Number(item.yaw),
      pitch: Number(item.pitch),
      roll: Number(item.roll),
      grip: Number(item.grip),
      hold_ms: Number(item.hold_ms),
      tolerance: Number(item.tolerance),
      safety_hold: Number(item.safety_hold),
    };
  });
}

function parseRuntimeAnchorsJsonl(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const anchor = JSON.parse(line);
      const pose = anchor.observed_pose || {};
      return {
        frame_id: anchor.anchor_id,
        anchor_id: anchor.anchor_id,
        t_ms: Number(anchor.t_ms),
        x: Number(pose.x),
        y: Number(pose.y),
        z: Number(pose.z),
        yaw: Number(pose.yaw),
        pitch: Number(pose.pitch),
        roll: Number(pose.roll),
        grip: Number(pose.grip),
        confidence: Number(anchor.confidence ?? 0.85),
        jitter: Number(anchor.jitter ?? 0),
        source: anchor.source || "runtime_anchor",
      };
    });
}

function initialState(keyframe) {
  return {
    frame_t_ms: keyframe.t_ms,
    targetIndex: 0,
    x: keyframe.x,
    y: keyframe.y,
    z: keyframe.z,
    yaw: keyframe.yaw,
    pitch: keyframe.pitch,
    roll: keyframe.roll,
    grip: keyframe.grip,
    vx: 0,
    vy: 0,
    vz: 0,
    error: 0,
    confidence: 0.95,
    csvLine: 1,
    anchorLoop: 1,
    keyframeLock: true,
  };
}

function frameFromKeyframe(keyframe, index = 0) {
  return {
    ...initialState(keyframe),
    targetIndex: index,
    csvLine: index + 2,
    target_frame: keyframe.frame_id,
  };
}

function segmentEndpoint(value, fallbackId, fallbackMs) {
  if (value && typeof value === "object") {
    return { frame_id: value.frame_id ?? fallbackId, t_ms: Number(value.t_ms ?? fallbackMs ?? 0) };
  }
  return { frame_id: value ?? fallbackId, t_ms: Number(fallbackMs ?? 0) };
}

function normalizePredictionFrame(frame, segmentType) {
  return {
    frame_t_ms: Number(frame.frame_t_ms),
    target_frame: frame.target_frame,
    x: Number(frame.palm_x),
    y: Number(frame.palm_y),
    z: Number(frame.palm_z),
    yaw: Number(frame.yaw),
    pitch: Number(frame.pitch),
    roll: Number(frame.roll),
    grip: Number(frame.grip),
    csvLine: Number(frame.csvLine),
    segmentType,
  };
}

function parsePredictionSegmentsJsonl(text) {
  return text
    .trim()
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line, index) => {
      const segment = JSON.parse(line);
      const segmentType = segment.segment_type || "confirmed";
      const frames = (segment.frames || []).map((frame) => normalizePredictionFrame(frame, segmentType));
      return {
        key: `${segment.segment_index ?? index}-${segmentType}-${segment.from?.frame_id ?? segment.from}-${segment.to?.frame_id ?? segment.to}`,
        segmentIndex: Number(segment.segment_index ?? index),
        segmentType,
        source: segment.source || "loaded_segments",
        from: segmentEndpoint(segment.from, `from_${index}`, segment.start_t_ms),
        to: segmentEndpoint(segment.to, `to_${index}`, segment.target_t_ms),
        confidence: Number(segment.confidence ?? 0.95),
        isPredictedTarget: Boolean(segment.is_predicted_target),
        isCorrected: Boolean(segment.is_corrected),
        framesBetweenKeyframes: Number(segment.frames_between_keyframes ?? Math.max(0, frames.length - 1)),
        frames,
        startLine: frames[0]?.csvLine ?? 0,
        endLine: frames[frames.length - 1]?.csvLine ?? 0,
      };
    });
}

function flattenPredictionSegments(segments) {
  return segments.flatMap((segment) => segment.frames);
}

function makeFrameState(nextFrame, previous, sequenceResult) {
  const dt = previous ? Math.max((nextFrame.frame_t_ms - previous.frame_t_ms) / 1000, 0.001) : RENDER_MS / 1000;
  return {
    frame_t_ms: nextFrame.frame_t_ms,
    targetIndex: 0,
    x: nextFrame.x,
    y: nextFrame.y,
    z: nextFrame.z,
    yaw: nextFrame.yaw,
    pitch: nextFrame.pitch,
    roll: nextFrame.roll,
    grip: nextFrame.grip,
    vx: previous ? (nextFrame.x - previous.x) / dt : 0,
    vy: previous ? (nextFrame.y - previous.y) / dt : 0,
    vz: previous ? (nextFrame.z - previous.z) / dt : 0,
    error: sequenceResult?.last_error ?? sequenceResult?.final_error ?? 0,
    confidence: sequenceResult?.success ? 1 : 0.85,
    csvLine: nextFrame.csvLine,
    anchorLoop: 1,
    target_frame: nextFrame.target_frame,
    keyframeLock: false,
  };
}

function formatPredictionCsvRow(frame) {
  return [
    Number(frame.frame_t_ms).toFixed(3).replace(/\.000$/, ""),
    frame.target_frame,
    frame.x.toFixed(6),
    frame.y.toFixed(6),
    frame.z.toFixed(6),
    frame.yaw.toFixed(6),
    frame.pitch.toFixed(6),
    frame.roll.toFixed(6),
    frame.grip.toFixed(6),
  ].join(",");
}

function makeMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.5, metalness: 0.06 });
}

function setBoneBetween(mesh, a, b) {
  const start = new THREE.Vector3(a.x, a.y, a.z);
  const end = new THREE.Vector3(b.x, b.y, b.z);
  const length = start.distanceTo(end);
  mesh.position.copy(start.clone().add(end).multiplyScalar(0.5));
  mesh.scale.set(1, Math.max(length, 0.001), 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
}

function createHandRig(scene) {
  const rig = new THREE.Group();
  const jointMeshes = {};
  const bones = [];
  const jointNames = [
    "wrist",
    "wrist_left",
    "wrist_right",
    "palm",
    "palm_base_left",
    "palm_base_right",
    "palm_left",
    "palm_right",
    "palm_top",
  ];
  FINGERS.forEach((finger) => FINGER_JOINTS.forEach((joint) => jointNames.push(`${finger.name}_${joint}`)));

  const palmShape = new THREE.Shape();
  palmShape.moveTo(-0.27, -0.16);
  palmShape.lineTo(0.27, -0.16);
  palmShape.lineTo(0.32, 0.08);
  palmShape.lineTo(0.2, 0.21);
  palmShape.lineTo(-0.2, 0.21);
  palmShape.lineTo(-0.32, 0.08);
  palmShape.lineTo(-0.27, -0.16);
  const palmMesh = new THREE.Mesh(
    new THREE.ShapeGeometry(palmShape),
    new THREE.MeshStandardMaterial({
      color: 0x2f6fa8,
      transparent: true,
      opacity: 0.38,
      roughness: 0.62,
      metalness: 0.02,
      side: THREE.DoubleSide,
    })
  );
  palmMesh.position.z = -0.025;
  palmMesh.receiveShadow = true;
  rig.add(palmMesh);

  jointNames.forEach((name) => {
    const isPalm = name.includes("palm");
    const isTip = name.endsWith("_tip");
    const isWrist = name.includes("wrist");
    const radius = name === "palm" ? 0.07 : isWrist ? 0.052 : isPalm ? 0.043 : isTip ? 0.038 : 0.033;
    const color = name.includes("thumb") ? 0xf59e0b : isPalm || isWrist ? 0x93c5fd : isTip ? 0x5eead4 : 0x14b8a6;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), makeMaterial(color));
    mesh.castShadow = true;
    jointMeshes[name] = mesh;
    rig.add(mesh);
  });

  const bonePairs = [
    ["wrist", "palm"],
    ["wrist_left", "wrist"],
    ["wrist", "wrist_right"],
    ["wrist_left", "palm_base_left"],
    ["wrist_right", "palm_base_right"],
    ["palm_base_left", "palm"],
    ["palm", "palm_base_right"],
    ["palm_left", "palm"],
    ["palm", "palm_right"],
    ["palm_left", "palm_top"],
    ["palm_top", "palm_right"],
    ["palm_base_left", "palm_left"],
    ["palm_base_right", "palm_right"],
  ];
  FINGERS.forEach((finger) => {
    const anchor = finger.name === "thumb" ? "palm_left" : "palm_top";
    bonePairs.push([anchor, `${finger.name}_metacarpal`]);
    bonePairs.push([`${finger.name}_metacarpal`, `${finger.name}_mcp`]);
    bonePairs.push([`${finger.name}_mcp`, `${finger.name}_pip`]);
    bonePairs.push([`${finger.name}_pip`, `${finger.name}_dip`]);
    bonePairs.push([`${finger.name}_dip`, `${finger.name}_tip`]);
  });

  bonePairs.forEach(([from, to]) => {
    const isPalmBone = from.includes("palm") || from.includes("wrist");
    const mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(isPalmBone ? 0.018 : 0.015, isPalmBone ? 0.018 : 0.015, 1, 12),
      makeMaterial(isPalmBone ? 0x9db9d8 : 0xd8e2ef)
    );
    mesh.castShadow = true;
    bones.push({ from, to, mesh });
    rig.add(mesh);
  });

  rig.rotation.x = -0.35;
  rig.scale.setScalar(HAND_SCALE);
  scene.add(rig);
  return { rig, jointMeshes, bones };
}

function applyHandFrame(parts, frame) {
  const joints = buildHandJoints(frame);
  parts.rig.position.set(frame.x * 1.8, frame.y * 1.8 + SCENE_Y_OFFSET, frame.z * 1.8);
  parts.rig.rotation.set(-0.35 + frame.pitch, frame.yaw, frame.roll);
  Object.entries(joints).forEach(([name, pose]) => {
    parts.jointMeshes[name].position.set(pose.x, pose.y, pose.z);
  });
  parts.bones.forEach(({ from, to, mesh }) => setBoneBetween(mesh, joints[from], joints[to]));
}

function HandFallback({ frame }) {
  const joints = buildHandJoints(frame);
  const pairs = [
    ["wrist", "palm"],
    ["wrist_left", "wrist"],
    ["wrist", "wrist_right"],
    ["palm_base_left", "palm"],
    ["palm", "palm_base_right"],
    ["palm_left", "palm"],
    ["palm", "palm_right"],
    ["palm_left", "palm_top"],
    ["palm_top", "palm_right"],
  ];
  FINGERS.forEach((finger) => {
    const anchor = finger.name === "thumb" ? "palm_left" : "palm_top";
    pairs.push([anchor, `${finger.name}_metacarpal`]);
    pairs.push([`${finger.name}_metacarpal`, `${finger.name}_mcp`]);
    pairs.push([`${finger.name}_mcp`, `${finger.name}_pip`]);
    pairs.push([`${finger.name}_pip`, `${finger.name}_dip`]);
    pairs.push([`${finger.name}_dip`, `${finger.name}_tip`]);
  });
  const point = (joint) => `${180 + joint.x * 280},${260 - joint.y * 280 - joint.z * 100}`;

  return (
    <div className="fallback-hand">
      <svg viewBox="0 0 360 360" role="img" aria-label="hand fallback">
        {pairs.map(([from, to]) => (
          <line key={`${from}-${to}`} x1={point(joints[from]).split(",")[0]} y1={point(joints[from]).split(",")[1]} x2={point(joints[to]).split(",")[0]} y2={point(joints[to]).split(",")[1]} />
        ))}
        {Object.entries(joints).map(([name, joint]) => {
          const [cx, cy] = point(joint).split(",");
          return <circle key={name} cx={cx} cy={cy} r={name.endsWith("_tip") ? 5 : 4} />;
        })}
      </svg>
    </div>
  );
}

function App() {
  const mountRef = useRef(null);
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
  const [dataStatus, setDataStatus] = useState("loading");
  const frameRef = useRef(null);
  const keyframeCsvRef = useRef("");
  const runtimeAnchorsTextRef = useRef("");
  const keyframeScrollRef = useRef(null);
  const activeKeyframeRowRef = useRef(null);
  const [frame, setFrame] = useState(frameRef.current);
  const keyframeIndexRef = useRef(0);
  const keyframeTickRef = useRef(0);
  const [running, setRunning] = useState(true);
  const [playMode, setPlayMode] = useState("prediction");
  const [selectedKeyframeIndex, setSelectedKeyframeIndex] = useState(0);
  const [renderError, setRenderError] = useState("");
  const [expandedSegments, setExpandedSegments] = useState({});

  const keyframes = runtimeAnchors;

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
    const loadedAnchors = parseRuntimeAnchorsJsonl(text);
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
    const segments = parsePredictionSegmentsJsonl(text);
    const frames = flattenPredictionSegments(segments);
    const isInitialLoad = previousText.length === 0;
    setSequenceSegments(segments);
    setSequenceFrames(frames);
    if (isInitialLoad) {
      segmentPlaybackRef.current = { segmentIndex: 0, startTime: performance.now(), lastFrameIndex: -1 };
    }
    if (isInitialLoad && playMode === "prediction" && frames.length > 0) {
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
      if (playMode === "keyframes") {
        const now = performance.now();
        if (!running && frameRef.current?.targetIndex === selectedKeyframeIndex) {
          return;
        }
        if (running && now - keyframeTickRef.current < ANCHOR_MS) {
          return;
        }
        const nextIndex = running ? (keyframeIndexRef.current + 1) % keyframes.length : selectedKeyframeIndex;
        keyframeTickRef.current = now;
        keyframeIndexRef.current = nextIndex;
        setSelectedKeyframeIndex(nextIndex);
        frameRef.current = frameFromKeyframe(keyframes[nextIndex], nextIndex);
        setFrame(frameRef.current);
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
        const segmentDuration = Math.max(1, segment.to.t_ms - segment.from.t_ms || ANCHOR_MS);
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
              setFrame(next);
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
          const nextDuration = Math.max(1, segment.to.t_ms - segment.from.t_ms || ANCHOR_MS);
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
        setFrame(next);
      }
    }, RENDER_MS);
    return () => window.clearInterval(timer);
  }, [keyframes, playMode, policy, running, selectedKeyframeIndex, sequenceFrames, sequenceResult]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !frameRef.current) {
      return undefined;
    }

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    let renderer;
    let controls;
    let frameId = 0;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setRenderError("WebGL is unavailable in this browser session.");
      return undefined;
    }

    scene.background = new THREE.Color(0x0b0f14);
    camera.position.set(0, 0.04, 5.2);
    camera.lookAt(0.0, -0.42, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.target.set(0.0, -0.42, 0);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enableZoom = true;
    controls.zoomSpeed = 1.15;
    controls.minDistance = 0.7;
    controls.maxDistance = 8.0;

    const hemi = new THREE.HemisphereLight(0xb7d7ff, 0x111923, 1.7);
    const key = new THREE.DirectionalLight(0xffffff, 2.4);
    key.position.set(2.5, 4, 2);
    key.castShadow = true;
    scene.add(hemi, key);

    const grid = new THREE.GridHelper(2.4, 12, 0x2f3a48, 0x202a36);
    grid.rotation.x = Math.PI / 2;
    grid.position.z = -0.22;
    scene.add(grid);

    const parts = createHandRig(scene);
    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };
    const animate = () => {
      applyHandFrame(parts, frameRef.current);
      controls.update();
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    resize();
    animate();
    window.addEventListener("resize", resize);
    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      controls.dispose();
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [frame !== null, keyframes.length > 0]);

  function resetDemo() {
    if (keyframes.length === 0) {
      return;
    }
    frameRef.current = frameFromKeyframe(keyframes[0], 0);
    keyframeIndexRef.current = 0;
    keyframeTickRef.current = 0;
    setSelectedKeyframeIndex(0);
    segmentPlaybackRef.current = { segmentIndex: 0, startTime: performance.now(), lastFrameIndex: -1 };
    setFrame(frameRef.current);
  }

  function showKeyframe(index) {
    if (!keyframes[index]) {
      return;
    }
    setRunning(false);
    setPlayMode("keyframes");
    setSelectedKeyframeIndex(index);
    keyframeIndexRef.current = index;
    frameRef.current = frameFromKeyframe(keyframes[index], index);
    setFrame(frameRef.current);
  }

  const sequenceMode = playMode === "prediction";
  const predictionSegments = sequenceSegments;

  useEffect(() => {
    const playableSegments = predictionSegments.filter((segment) => segment.frames.length > 0);
    predictionSegmentsRef.current = playableSegments;
    if (playableSegments.length === 0) {
      return;
    }
    if (segmentPlaybackRef.current.segmentIndex >= playableSegments.length) {
      segmentPlaybackRef.current = { segmentIndex: 0, startTime: performance.now(), lastFrameIndex: -1 };
    }
  }, [predictionSegments]);

  const frameKeyframeIndex = frame
    ? Math.max(
        0,
        keyframes.findIndex((item, index) => index === frame.targetIndex || item.frame_id === frame.target_frame || item.t_ms === Math.round(frame.frame_t_ms))
      )
    : 0;
  const activeSegmentIndex = Math.max(
    0,
    predictionSegments.findIndex((segment) => segment.frames.some((item) => item.csvLine === frame?.csvLine) || segment.to.frame_id === frame?.target_frame)
  );
  const activeSegment = predictionSegments[activeSegmentIndex];
  const keyframeIndexById = useMemo(() => new Map(keyframes.map((item, index) => [item.frame_id, index])), [keyframes]);
  const activeKeyframeIndex = sequenceMode
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
          <button type="button" onClick={() => setRunning(!running)} title={running ? "Pause" : "Play"}>
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
        <div className="stage" ref={mountRef}>
          {renderError ? <HandFallback frame={frame} /> : null}
        </div>
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
              <button type="button" className={playMode === "prediction" ? "active" : ""} onClick={() => setPlayMode("prediction")}>
                Prediction
              </button>
              <button type="button" className={playMode === "keyframes" ? "active" : ""} onClick={() => setPlayMode("keyframes")}>
                Anchors
              </button>
            </div>
            <div className="keyframe-picker">
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
            </div>
          </div>

          <div className="script-panels">
            <div className="script-panel">
              <div className="timeline-head">
                <span>runtime io anchors</span>
                <strong>
                  {activeKeyframeIndex + 1}/{keyframes.length}
                </strong>
              </div>
              <div className="script-window keyframe-window" ref={keyframeScrollRef}>
                {keyframes.map((item, keyframeIndex) => {
                  const segmentsForKeyframe = predictionSegments.filter(
                    (segment) => segment.from.frame_id === item.frame_id || (segment.segmentType === "correction" && segment.to.frame_id === item.frame_id)
                  );
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
                            const windowEnd = isActiveSegment ? Math.min(segment.frames.length, segmentActiveIndex + PREDICTION_WINDOW_AFTER + 1) : Math.min(segment.frames.length, 24);
                            const visibleFrames = segment.frames.slice(windowStart, windowEnd);
                            return (
                              <div className="keyframe-prediction-block" key={segment.key}>
                                <button type="button" className={`segment-toggle ${segment.segmentType}`} onClick={() => toggleSegment(segment.key)}>
                                  {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                                  <span>{segment.segmentType}</span>
                                  <strong>{segment.frames.length} rows</strong>
                                  <span>{segment.to.frame_id}</span>
                                </button>
                                {isOpen ? (
                                  <div className="predicted-list">
                                    <div className="script-row header">
                                      <span>#</span>
                                      <code>{sequenceCsvRows[0] || "frame_t_ms,target_frame,palm_x,palm_y,palm_z,yaw,pitch,roll,grip"}</code>
                                    </div>
                                    {visibleFrames.map((prediction) => {
                                      const predictionRow = sequenceCsvRows[prediction.csvLine - 1] || "";
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
                                ) : null}
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
            </div>
            <div className="script-panel">
              <div className="timeline-head">
                <span>reference samples</span>
                <strong>{sampleKeyframes.length}</strong>
              </div>
              <div className="script-window keyframe-window">
                {sampleKeyframes.slice(0, 48).map((item, index) => (
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

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
