import * as THREE from "three";

export const SCENE_Y_OFFSET = 0.62;
export const HAND_SCALE = 0.64;
export const FINGER_JOINTS = ["metacarpal", "mcp", "pip", "dip", "tip"];
export const FINGERS = [
  { name: "thumb", base: [-0.31, -0.07, 0.045], spread: -0.42, length: [0.07, 0.13, 0.12, 0.095, 0.055], angle: -0.72, curlBias: 1.2 },
  { name: "index", base: [-0.15, 0.18, 0.025], spread: -0.14, length: [0.08, 0.17, 0.15, 0.115, 0.06], angle: 0.12, curlBias: 1.0, fistInward: 0.008 },
  { name: "middle", base: [0.0, 0.2, 0.025], spread: 0.0, length: [0.085, 0.185, 0.16, 0.12, 0.065], angle: 0.0, curlBias: 1.0, fistInward: 0.003 },
  { name: "ring", base: [0.14, 0.18, 0.025], spread: 0.1, length: [0.08, 0.165, 0.145, 0.11, 0.06], angle: -0.1, curlBias: 1.0, fistInward: 0.012 },
  { name: "pinky", base: [0.27, 0.13, 0.025], spread: 0.22, length: [0.07, 0.14, 0.12, 0.09, 0.052], angle: -0.24, curlBias: 1.05, fistInward: 0.014 },
];

function clamp(value, low, high) {
  return Math.max(low, Math.min(high, value));
}

function smoothstep(value) {
  const t = clamp(value, 0, 1);
  return t * t * (3 - 2 * t);
}

export function buildHandJoints(frame) {
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
    const side = finger.spread;
    const baseAngle = finger.angle;
    finger.length.forEach((length, index) => {
      const fingerSign = Math.sign(finger.spread || 0.02);
      const dir = baseAngle + side * (1 - curl * 0.25);
      const lateral = Math.sin(dir) * length * (finger.name === "thumb" ? 0.55 : 0.22);
      const yzLength = Math.sqrt(Math.max(length * length - lateral * lateral, 0.001));
      const bend = curl * (finger.name === "thumb" ? 0.45 + index * 0.38 : 0.22 + index * 0.54);
      x += lateral;
      y += Math.cos(bend) * yzLength;
      z += Math.sin(bend) * yzLength;
      if (finger.name === "thumb") {
        x += curl * curl * 0.055 * (index + 1);
        y -= curl * curl * 0.02 * index;
      } else {
        x -= curl * curl * (finger.fistInward ?? 0.012) * (index + 1) * fingerSign;
        y -= curl * curl * 0.028 * index;
      }
      joints[`${finger.name}_${FINGER_JOINTS[index]}`] = { x, y, z };
    });
  });
  return joints;
}

export function canClearanceMetrics(frame, joints = buildHandJoints(frame)) {
  let minClearance = 1;
  let worstJoint = "none";
  Object.entries(joints).forEach(([name, pose]) => {
    if (![pose.x, pose.y, pose.z].every(Number.isFinite)) {
      minClearance = -1;
      worstJoint = name;
    }
  });
  return { minClearance, worstJoint };
}

export function handMotionMetrics(frame, joints = buildHandJoints(frame)) {
  let maxSegmentLength = 0;
  let tipYAverage = 0;
  let tipCount = 0;
  FINGERS.forEach((finger) => {
    const names = FINGER_JOINTS.map((joint) => `${finger.name}_${joint}`);
    for (let index = 1; index < names.length; index += 1) {
      const parent = joints[names[index - 1]];
      const child = joints[names[index]];
      maxSegmentLength = Math.max(maxSegmentLength, new THREE.Vector3(child.x - parent.x, child.y - parent.y, child.z - parent.z).length());
      if (names[index].endsWith("_tip")) {
        tipYAverage += child.y;
        tipCount += 1;
      }
    }
  });
  return { maxSegmentLength, tipYAverage: tipCount ? tipYAverage / tipCount : 0 };
}
