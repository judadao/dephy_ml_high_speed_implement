import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { ChevronDown, ChevronRight, Pause, Play, RotateCcw } from "lucide-react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import "./styles.css";

const KEYFRAME_URL = "/demo/hand_keyframes.csv";
const POLICY_URL = "/demo/hand_policy.json";
const SEQUENCE_URL = "/demo/hand_sequence/prediction.csv";
const RESULT_URL = "/demo/hand_sequence/result.json";
const RENDER_MS = 16;
const ANCHOR_MS = 300;
const SCENE_Y_OFFSET = 0.62;
const HAND_SCALE = 0.64;
const CAN_WORLD_CENTER = new THREE.Vector3(0.15, 0.26 + SCENE_Y_OFFSET, 0.03);
const CAN_RADIUS = 0.105;
const CAN_HALF_HEIGHT = 0.29;
const DEFAULT_POLICY = {
  format: "dephy_hand_policy_v1",
  kp_pos: 8.5,
  kd_pos: 2.1,
  kp_rot: 3.2,
  kp_grip: 4.0,
  speed_scale: 0.82,
};
const FINGER_JOINTS = ["metacarpal", "mcp", "pip", "dip", "tip"];
const FINGERS = [
  { name: "thumb", base: [-0.31, -0.07, 0.045], spread: -0.42, length: [0.07, 0.13, 0.12, 0.095, 0.055], angle: -0.72, curlBias: 1.2 },
  { name: "index", base: [-0.15, 0.18, 0.025], spread: -0.14, length: [0.08, 0.17, 0.15, 0.115, 0.06], angle: 0.12, curlBias: 1.0 },
  { name: "middle", base: [0.0, 0.2, 0.025], spread: 0.0, length: [0.085, 0.185, 0.16, 0.12, 0.065], angle: 0.0, curlBias: 1.0 },
  { name: "ring", base: [0.14, 0.18, 0.025], spread: 0.1, length: [0.08, 0.165, 0.145, 0.11, 0.06], angle: -0.1, curlBias: 1.0 },
  { name: "pinky", base: [0.27, 0.13, 0.025], spread: 0.22, length: [0.07, 0.14, 0.12, 0.09, 0.052], angle: -0.24, curlBias: 1.05 },
];
const CAN_GRASP_JOINT_TARGETS = {
  thumb: [
    [-0.28, -0.035, 0.07],
    [-0.21, 0.025, 0.12],
    [-0.13, 0.075, 0.16],
    [-0.055, 0.115, 0.18],
    [0.01, 0.135, 0.175],
  ],
  index: [
    [-0.145, 0.255, 0.065],
    [-0.125, 0.315, 0.125],
    [-0.095, 0.275, 0.19],
    [-0.07, 0.215, 0.215],
    [-0.052, 0.165, 0.195],
  ],
  middle: [
    [0.0, 0.275, 0.065],
    [0.0, 0.335, 0.13],
    [0.0, 0.29, 0.2],
    [0.0, 0.225, 0.225],
    [0.0, 0.17, 0.205],
  ],
  ring: [
    [0.135, 0.255, 0.065],
    [0.115, 0.315, 0.125],
    [0.088, 0.275, 0.19],
    [0.064, 0.215, 0.215],
    [0.046, 0.165, 0.195],
  ],
  pinky: [
    [0.245, 0.205, 0.06],
    [0.215, 0.26, 0.115],
    [0.18, 0.235, 0.175],
    [0.145, 0.185, 0.2],
    [0.115, 0.145, 0.18],
  ],
};

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function parseCsv(text) {
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

function parsePredictionCsv(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return [];
  }
  const [headerLine, ...rows] = trimmed.split(/\r?\n/);
  const headers = headerLine.split(",");
  return rows.map((row, index) => {
    const values = row.split(",");
    const item = Object.fromEntries(headers.map((key, column) => [key, values[column]]));
    return {
      frame_t_ms: Number(item.frame_t_ms),
      target_frame: item.target_frame || `frame_${index}`,
      x: Number(item.palm_x),
      y: Number(item.palm_y),
      z: Number(item.palm_z),
      yaw: Number(item.yaw),
      pitch: Number(item.pitch),
      roll: Number(item.roll),
      grip: Number(item.grip),
      csvLine: index + 2,
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
  };
}

function frameDistance(frame, keyframe) {
  const pos = Math.hypot(keyframe.x - frame.x, keyframe.y - frame.y, keyframe.z - frame.z);
  const rot = Math.hypot(keyframe.yaw - frame.yaw, keyframe.pitch - frame.pitch, keyframe.roll - frame.roll);
  const grip = Math.abs(keyframe.grip - frame.grip);
  return pos + rot * 0.18 + grip * 0.12;
}

function nearestFrameIndex(frames, keyframe, startIndex) {
  let bestIndex = startIndex;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let index = startIndex; index < frames.length; index += 1) {
    const distance = frameDistance(frames[index], keyframe);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestIndex = index;
    }
  }
  return bestIndex;
}

function buildSequenceTimeline(frames, keyframes) {
  if (frames.length === 0 || keyframes.length === 0) {
    return [];
  }

  let cursor = 0;
  const anchors = keyframes.map((keyframe, index) => {
    const frameIndex = nearestFrameIndex(frames, keyframe, cursor);
    cursor = Math.min(frameIndex + 1, frames.length - 1);
    return {
      type: "keyframe",
      key: `keyframe-${keyframe.frame_id}-${index}`,
      keyframe,
      frame: frames[frameIndex],
      frameIndex,
    };
  });

  const blocks = [];
  anchors.forEach((anchor, index) => {
    blocks.push(anchor);
    const nextAnchor = anchors[index + 1];
    if (!nextAnchor) {
      return;
    }
    const predicted = frames.slice(anchor.frameIndex + 1, nextAnchor.frameIndex);
    blocks.push({
      type: "prediction",
      key: `prediction-${anchor.keyframe.frame_id}-${nextAnchor.keyframe.frame_id}`,
      from: anchor.keyframe,
      to: nextAnchor.keyframe,
      frames: predicted,
    });
  });
  return blocks;
}

function nextSequenceIndexByTime(frames, currentIndex, stepMs) {
  if (frames.length <= 1) {
    return 0;
  }
  const currentTime = frames[currentIndex]?.frame_t_ms ?? frames[0].frame_t_ms;
  const endTime = frames[frames.length - 1].frame_t_ms;
  const targetTime = currentTime + stepMs;
  if (targetTime > endTime) {
    return 0;
  }
  for (let index = currentIndex + 1; index < frames.length; index += 1) {
    if (frames[index].frame_t_ms >= targetTime) {
      return index;
    }
  }
  return frames.length - 1;
}

function errorToTarget(state, target) {
  const pos = Math.hypot(target.x - state.x, target.y - state.y, target.z - state.z);
  const rot = Math.hypot(target.yaw - state.yaw, target.pitch - state.pitch, target.roll - state.roll) * 0.2;
  const grip = Math.abs(target.grip - state.grip) * 0.1;
  return pos + rot + grip;
}

function stepPredictor(state, target, policy) {
  const dt = RENDER_MS / 1000;
  const kp = policy.kp_pos || DEFAULT_POLICY.kp_pos;
  const kd = policy.kd_pos || DEFAULT_POLICY.kd_pos;
  const speedScale = clamp(policy.speed_scale || DEFAULT_POLICY.speed_scale, 0.05, 1);
  const maxSpeed = 1.25 * speedScale;
  const maxAccel = 6.5;
  let desiredVx = (target.x - state.x) * kp - state.vx * kd;
  let desiredVy = (target.y - state.y) * kp - state.vy * kd;
  let desiredVz = (target.z - state.z) * kp - state.vz * kd;
  const desiredLen = Math.hypot(desiredVx, desiredVy, desiredVz);
  if (desiredLen > maxSpeed) {
    desiredVx = (desiredVx / desiredLen) * maxSpeed;
    desiredVy = (desiredVy / desiredLen) * maxSpeed;
    desiredVz = (desiredVz / desiredLen) * maxSpeed;
  }

  let dvx = desiredVx - state.vx;
  let dvy = desiredVy - state.vy;
  let dvz = desiredVz - state.vz;
  const dvLen = Math.hypot(dvx, dvy, dvz);
  const maxDv = maxAccel * dt;
  if (dvLen > maxDv) {
    dvx = (dvx / dvLen) * maxDv;
    dvy = (dvy / dvLen) * maxDv;
    dvz = (dvz / dvLen) * maxDv;
  }

  const vx = state.vx + dvx;
  const vy = state.vy + dvy;
  const vz = state.vz + dvz;
  const next = {
    ...state,
    frame_t_ms: state.frame_t_ms + RENDER_MS,
    x: state.x + vx * dt,
    y: state.y + vy * dt,
    z: state.z + vz * dt,
    yaw: state.yaw + clamp((target.yaw - state.yaw) * (policy.kp_rot || DEFAULT_POLICY.kp_rot), -3.2 * dt * speedScale, 3.2 * dt * speedScale),
    pitch: state.pitch + clamp((target.pitch - state.pitch) * (policy.kp_rot || DEFAULT_POLICY.kp_rot), -3.2 * dt * speedScale, 3.2 * dt * speedScale),
    roll: state.roll + clamp((target.roll - state.roll) * (policy.kp_rot || DEFAULT_POLICY.kp_rot), -3.2 * dt * speedScale, 3.2 * dt * speedScale),
    grip: clamp(state.grip + clamp((target.grip - state.grip) * (policy.kp_grip || DEFAULT_POLICY.kp_grip), -4.0 * dt * speedScale, 4.0 * dt * speedScale), 0, 1),
    vx,
    vy,
    vz,
  };
  next.error = errorToTarget(next, target);
  next.confidence = clamp(0.65 + (1 - next.error) * 0.28, 0.35, 0.98);
  return next;
}

function buildHandJoints(frame) {
  const joints = {
    wrist: { x: 0, y: -0.38, z: 0 },
    wrist_left: { x: -0.18, y: -0.34, z: 0 },
    wrist_right: { x: 0.18, y: -0.34, z: 0 },
    palm: { x: 0, y: 0, z: 0 },
    palm_base_left: { x: -0.27, y: -0.14, z: 0 },
    palm_base_right: { x: 0.27, y: -0.14, z: 0 },
    palm_left: { x: -0.31, y: 0.08, z: 0 },
    palm_right: { x: 0.31, y: 0.08, z: 0 },
    palm_top: { x: 0, y: 0.22, z: 0.01 },
  };

  FINGERS.forEach((finger) => {
    let [x, y, z] = finger.base;
    const curl = clamp(frame.grip * finger.curlBias, 0, 1);
    const close = clamp((curl - 0.55) / 0.45, 0, 1);
    const side = finger.spread;
    const baseAngle = finger.angle;
    finger.length.forEach((length, index) => {
      const fingerSign = Math.sign(finger.spread || 0.02);
      const bend = curl * (0.58 + index * 0.5);
      const dir = baseAngle + side * (1 - curl * 0.58);
      const reach = 1 - curl * (0.28 + index * 0.16);
      const inward = curl * curl * 0.026 * (index + 1) * (finger.name === "thumb" ? 1.7 : -fingerSign);
      const palmward = finger.name === "thumb" ? curl * curl * 0.01 * index : curl * curl * 0.083 * (index + 1);
      x += Math.sin(dir) * length * Math.max(reach, 0.18);
      x += inward;
      y += Math.cos(dir) * length * (1 - curl * (0.58 + index * 0.26));
      y -= palmward;
      z += Math.sin(bend) * (0.082 + index * 0.066);
      if (finger.name === "thumb") {
        const [targetX, targetY, targetZ] = CAN_GRASP_JOINT_TARGETS.thumb[index];
        x += close * 0.028 * (index + 1);
        x = x * (1 - close) + targetX * close;
        y = y * (1 - close) + targetY * close;
        z = z * (1 - close) + targetZ * close;
      } else {
        const [targetX, targetY, targetZ] = CAN_GRASP_JOINT_TARGETS[finger.name][index];
        x = x * (1 - close) + targetX * close;
        y = y * (1 - close) + targetY * close;
        z = z * (1 - close) + targetZ * close;
      }
      joints[`${finger.name}_${FINGER_JOINTS[index]}`] = { x, y, z };
    });
  });
  keepFingerJointsOutsideCan(joints, frame);
  return joints;
}

function keepFingerJointsOutsideCan(joints, frame) {
  const gripClose = clamp((frame.grip - 0.5) / 0.5, 0, 1);
  const rigPosition = new THREE.Vector3(frame.x * 1.8, frame.y * 1.8 + SCENE_Y_OFFSET, frame.z * 1.8);
  const rigRotation = new THREE.Euler(-0.35 + frame.pitch, frame.yaw, frame.roll);
  const inverseRig = new THREE.Quaternion().setFromEuler(rigRotation).invert();
  const canCenter = CAN_WORLD_CENTER.clone().sub(rigPosition).applyQuaternion(inverseRig).divideScalar(HAND_SCALE);
  const proximity = clamp((0.78 - canCenter.length()) / 0.38, 0, 1);
  const collisionStrength = Math.max(gripClose, proximity);
  if (collisionStrength <= 0) {
    return;
  }
  const canAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(inverseRig).normalize();
  const canRadius = CAN_RADIUS / HAND_SCALE;
  const canHalfHeight = CAN_HALF_HEIGHT / HAND_SCALE;

  FINGERS.forEach((finger) => {
    FINGER_JOINTS.forEach((joint, index) => {
      const name = `${finger.name}_${joint}`;
      const pose = joints[name];
      const point = new THREE.Vector3(pose.x, pose.y, pose.z);
      const offset = point.clone().sub(canCenter);
      const axialDistance = offset.dot(canAxis);
      if (Math.abs(axialDistance) > canHalfHeight + 0.08) {
        return;
      }
      const axial = canAxis.clone().multiplyScalar(axialDistance);
      const radial = offset.sub(axial);
      const radialDistance = radial.length();
      const jointClearance = (index >= 3 ? 0.06 : 0.045) / HAND_SCALE;
      const minimumDistance = canRadius + jointClearance;
      if (radialDistance >= minimumDistance) {
        return;
      }
      const fallbackNormal = new THREE.Vector3(finger.base[0] || 0.01, 0, 0.12).normalize();
      const normal = radialDistance > 0.001 ? radial.normalize() : fallbackNormal;
      const corrected = canCenter.clone().add(axial).add(normal.multiplyScalar(minimumDistance));
      pose.x = pose.x * (1 - collisionStrength) + corrected.x * collisionStrength;
      pose.y = pose.y * (1 - collisionStrength) + corrected.y * collisionStrength;
      pose.z = pose.z * (1 - collisionStrength) + corrected.z * collisionStrength;
    });
  });
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

function createCanTarget(scene) {
  const group = new THREE.Group();
  group.position.set(0.15, 0.26 + SCENE_Y_OFFSET, 0.03);

  const body = new THREE.Mesh(
    new THREE.CylinderGeometry(0.105, 0.105, 0.58, 48),
    new THREE.MeshStandardMaterial({
      color: 0xb7c4d3,
      roughness: 0.42,
      metalness: 0.38,
      transparent: true,
      opacity: 0.78,
    })
  );
  body.castShadow = true;
  body.receiveShadow = true;
  group.add(body);

  const lidMaterial = new THREE.MeshStandardMaterial({ color: 0xe7eef8, roughness: 0.35, metalness: 0.55 });
  [-0.295, 0.295].forEach((y) => {
    const lid = new THREE.Mesh(new THREE.CylinderGeometry(0.108, 0.108, 0.014, 48), lidMaterial);
    lid.position.y = y;
    lid.castShadow = true;
    group.add(lid);
  });

  const label = new THREE.Mesh(
    new THREE.BoxGeometry(0.012, 0.34, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x14b8a6, roughness: 0.5, metalness: 0.08 })
  );
  label.position.set(0.106, 0, 0);
  group.add(label);

  scene.add(group);
  return group;
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
  const [keyframeCsv, setKeyframeCsv] = useState("");
  const [keyframes, setKeyframes] = useState([]);
  const [policy, setPolicy] = useState(DEFAULT_POLICY);
  const [sequenceCsv, setSequenceCsv] = useState("");
  const [sequenceFrames, setSequenceFrames] = useState([]);
  const [sequenceResult, setSequenceResult] = useState(null);
  const [sequenceStatus, setSequenceStatus] = useState("waiting");
  const [dataStatus, setDataStatus] = useState("loading");
  const frameRef = useRef(null);
  const keyframeCsvRef = useRef("");
  const [frame, setFrame] = useState(frameRef.current);
  const sequenceIndexRef = useRef(0);
  const [running, setRunning] = useState(true);
  const [renderError, setRenderError] = useState("");
  const [expandedSegments, setExpandedSegments] = useState({});

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
        const loadedKeyframes = parseCsv(csv);
        keyframeCsvRef.current = csv;
        setKeyframeCsv(csv);
        setKeyframes(loadedKeyframes);
        setPolicy({ ...DEFAULT_POLICY, ...loadedPolicy });
        frameRef.current = initialState(loadedKeyframes[0]);
        setFrame(frameRef.current);
        setDataStatus("loaded");
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
    const loadKeyframes = () => {
      fetch(`${KEYFRAME_URL}?t=${Date.now()}`, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) {
            throw new Error(KEYFRAME_URL);
          }
          return response.text();
        })
        .then((csv) => {
          if (cancelled || csv === keyframeCsvRef.current) {
            return;
          }
          const loadedKeyframes = parseCsv(csv);
          keyframeCsvRef.current = csv;
          setKeyframeCsv(csv);
          setKeyframes(loadedKeyframes);
          if (!frameRef.current) {
            frameRef.current = initialState(loadedKeyframes[0]);
            setFrame(frameRef.current);
          }
          setDataStatus("loaded");
        })
        .catch(() => {
          if (!cancelled) {
            setDataStatus("load error");
          }
        });
    };
    const timer = window.setInterval(loadKeyframes, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    const loadSequence = () => {
      fetch(`${SEQUENCE_URL}?t=${Date.now()}`, { cache: "no-store" })
        .then((response) => {
          if (!response.ok) {
            throw new Error(SEQUENCE_URL);
          }
          return response.text();
        })
        .then((csv) => {
          if (cancelled || csv === sequenceCsv) {
            return;
          }
          const frames = parsePredictionCsv(csv);
          if (frames.length === 0) {
            return;
          }
          setSequenceCsv(csv);
          setSequenceFrames(frames);
          sequenceIndexRef.current = 0;
          const first = frames[0];
          frameRef.current = {
            frame_t_ms: first.frame_t_ms,
            targetIndex: 0,
            x: first.x,
            y: first.y,
            z: first.z,
            yaw: first.yaw,
            pitch: first.pitch,
            roll: first.roll,
            grip: first.grip,
            vx: 0,
            vy: 0,
            vz: 0,
            error: 0,
            confidence: 1,
            csvLine: first.csvLine,
            anchorLoop: 1,
            target_frame: first.target_frame,
          };
          setFrame(frameRef.current);
          setSequenceStatus("loaded");
        })
        .catch(() => {
          if (!cancelled) {
            setSequenceStatus("waiting");
          }
        });

      fetch(`${RESULT_URL}?t=${Date.now()}`, { cache: "no-store" })
        .then((response) => (response.ok ? response.json() : null))
        .then((result) => {
          if (!cancelled && result) {
            setSequenceResult(result);
          }
        })
        .catch(() => {});
    };
    loadSequence();
    const timer = window.setInterval(loadSequence, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [sequenceCsv]);

  useEffect(() => {
    if (!running || keyframes.length === 0 || !frameRef.current) {
      return undefined;
    }
    const timer = window.setInterval(() => {
      if (sequenceFrames.length > 0) {
        const currentIndex = sequenceIndexRef.current;
        const nextIndex = nextSequenceIndexByTime(sequenceFrames, currentIndex, RENDER_MS);
        const current = sequenceFrames[currentIndex];
        const nextFrame = sequenceFrames[nextIndex];
        const previous = frameRef.current;
        const dt = nextIndex === 0 ? RENDER_MS / 1000 : Math.max((nextFrame.frame_t_ms - current.frame_t_ms) / 1000, RENDER_MS / 1000);
        const next = {
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
          error: sequenceResult?.final_error ?? 0,
          confidence: sequenceResult?.success ? 1 : 0.85,
          csvLine: nextFrame.csvLine,
          anchorLoop: Math.floor(nextIndex / Math.max(sequenceFrames.length - 1, 1)) + 1,
          target_frame: nextFrame.target_frame,
        };
        sequenceIndexRef.current = nextIndex;
        frameRef.current = next;
        setFrame(next);
        return;
      }

      const current = frameRef.current;
      const anchorStep = Math.floor(current.frame_t_ms / ANCHOR_MS);
      const targetIndex = (anchorStep % (keyframes.length - 1)) + 1;
      const anchorLoop = Math.floor(anchorStep / (keyframes.length - 1)) + 1;
      const target = keyframes[targetIndex];
      let next = stepPredictor({ ...current, targetIndex, anchorLoop }, target, policy);
      next.targetIndex = targetIndex;
      next.csvLine = targetIndex + 1;
      next.anchorLoop = anchorLoop;
      if (next.frame_t_ms > keyframes[keyframes.length - 1].t_ms && targetIndex === keyframes.length - 1 && next.error < target.tolerance) {
        next = initialState(keyframes[0]);
        next.anchorLoop = anchorLoop + 1;
      }
      frameRef.current = next;
      setFrame(next);
    }, RENDER_MS);
    return () => window.clearInterval(timer);
  }, [keyframes, policy, running, sequenceFrames, sequenceResult]);

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

    createCanTarget(scene);
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
    frameRef.current = initialState(keyframes[0]);
    sequenceIndexRef.current = 0;
    setFrame(frameRef.current);
  }

  const sequenceMode = sequenceFrames.length > 0;
  const sequenceTimeline = useMemo(() => buildSequenceTimeline(sequenceFrames, keyframes), [sequenceFrames, keyframes]);

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
  const csvRows = (sequenceMode ? sequenceCsv : keyframeCsv).trim().split(/\r?\n/);
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
    ["source", sequenceMode ? "sequence csv" : "browser fallback"],
    ["frames", sequenceMode ? sequenceFrames.length : keyframes.length],
    ["status", sequenceStatus],
    ["success", sequenceResult ? String(sequenceResult.success) : "-"],
    ["completion", sequenceResult?.completion_rate !== undefined ? Number(sequenceResult.completion_rate).toFixed(3) : "-"],
    ["trials", sequenceResult?.completion_trials ?? "-"],
    ["error", sequenceResult ? Number(sequenceResult.final_error).toFixed(5) : "-"],
    ["jump", sequenceResult ? Number(sequenceResult.max_position_jump).toFixed(4) : "-"],
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
              <strong>{sequenceMode ? "CSV" : `${RENDER_MS}ms`}</strong>
            </div>
            <div>
              <span>fill</span>
              <strong>{sequenceMode ? `${sequenceFrames.length}f` : `${predictedGap}/gap`}</strong>
            </div>
          </div>

          <div className="source-strip">
            <span>{sequenceMode ? SEQUENCE_URL : KEYFRAME_URL}</span>
            <span>{sequenceMode ? RESULT_URL : POLICY_URL}</span>
          </div>

          <div className="timeline">
            <div className="timeline-head">
              <span>{sequenceMode ? "realtime prediction csv" : "keyframe script"}</span>
              <strong>{sequenceMode ? `line ${frame.csvLine}` : `loop ${frame.anchorLoop}`}</strong>
            </div>
            <div className="keyframe-list">
              {sequenceMode
                ? sequenceTimeline.map((block) => {
                    if (block.type === "keyframe") {
                      const isActive = block.frame?.csvLine === frame.csvLine || block.keyframe.frame_id === frame.target_frame;
                      return (
                        <div className={isActive ? "keyframe keyframe-anchor active" : "keyframe keyframe-anchor"} key={block.key}>
                          <span>{block.frame?.frame_t_ms ?? block.keyframe.t_ms}</span>
                          <strong>{block.keyframe.frame_id}</strong>
                          <em>{block.keyframe.grip.toFixed(2)}</em>
                        </div>
                      );
                    }
                    const isOpen = Boolean(expandedSegments[block.key]);
                    const isActive = block.frames.some((item) => item.csvLine === frame.csvLine);
                    return (
                      <div className={isActive ? "prediction-segment active" : "prediction-segment"} key={block.key}>
                        <button type="button" className="segment-toggle" onClick={() => toggleSegment(block.key)}>
                          {isOpen ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
                          <span>{block.from.frame_id}</span>
                          <strong>{block.frames.length} predicted</strong>
                          <span>{block.to.frame_id}</span>
                        </button>
                        {isOpen ? (
                          <div className="predicted-list">
                            {block.frames.map((item) => (
                              <div className={item.csvLine === frame.csvLine ? "prediction-frame active" : "prediction-frame"} key={`${item.csvLine}-${item.frame_t_ms}`}>
                                <span>{item.frame_t_ms}</span>
                                <strong>{item.target_frame}</strong>
                                <em>{item.grip.toFixed(2)}</em>
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                    );
                  })
                : keyframes.map((item, index) => (
                    <div className={index === frame.targetIndex ? "keyframe keyframe-anchor active" : "keyframe keyframe-anchor"} key={item.frame_id}>
                      <span>{item.t_ms}</span>
                      <strong>{item.frame_id}</strong>
                      <em>{item.grip.toFixed(2)}</em>
                    </div>
                  ))}
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

          <div className="csv-panel">
            <div className="timeline-head">
              <span>{sequenceMode ? "prediction csv" : "csv anchor stream"}</span>
              <strong>line {frame.csvLine}</strong>
            </div>
            <pre>{csvRows.slice(0, 1).concat(csvRows.slice(Math.max(1, frame.csvLine - 1), frame.csvLine + 2)).join("\n")}</pre>
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
