import * as THREE from "three";

export const SCENE_Y_OFFSET = 0.62;
export const HAND_SCALE = 0.64;
export const CAN_WORLD_CENTER = new THREE.Vector3(0.15, 0.26 + SCENE_Y_OFFSET, 0.03);
export const CAN_RADIUS = 0.105;
export const CAN_HALF_HEIGHT = 0.29;
export const FINGER_JOINTS = ["metacarpal", "mcp", "pip", "dip", "tip"];
const PALM_COLLISION_JOINTS = ["palm", "palm_top", "palm_left", "palm_right"];
export const FINGERS = [
  { name: "thumb", base: [-0.31, -0.07, 0.045], spread: -0.42, length: [0.07, 0.13, 0.12, 0.095, 0.055], angle: -0.72, curlBias: 1.2 },
  { name: "index", base: [-0.15, 0.18, 0.025], spread: -0.14, length: [0.08, 0.17, 0.15, 0.115, 0.06], angle: 0.12, curlBias: 1.0 },
  { name: "middle", base: [0.0, 0.2, 0.025], spread: 0.0, length: [0.085, 0.185, 0.16, 0.12, 0.065], angle: 0.0, curlBias: 1.0 },
  { name: "ring", base: [0.14, 0.18, 0.025], spread: 0.1, length: [0.08, 0.165, 0.145, 0.11, 0.06], angle: -0.1, curlBias: 1.0 },
  { name: "pinky", base: [0.27, 0.13, 0.025], spread: 0.22, length: [0.07, 0.14, 0.12, 0.09, 0.052], angle: -0.24, curlBias: 1.05 },
];

const CAN_GRASP_JOINT_TARGETS = {
  thumb: [
    [-0.28, -0.035, 0.07],
    [-0.22, 0.025, 0.105],
    [-0.155, 0.075, 0.13],
    [-0.09, 0.115, 0.14],
    [-0.035, 0.145, 0.13],
  ],
  index: [
    [-0.145, 0.255, 0.065],
    [-0.135, 0.325, 0.125],
    [-0.115, 0.305, 0.175],
    [-0.095, 0.265, 0.19],
    [-0.075, 0.23, 0.175],
  ],
  middle: [
    [0.0, 0.275, 0.065],
    [0.0, 0.345, 0.13],
    [0.0, 0.325, 0.185],
    [0.0, 0.28, 0.2],
    [0.0, 0.24, 0.185],
  ],
  ring: [
    [0.135, 0.255, 0.065],
    [0.118, 0.325, 0.125],
    [0.096, 0.305, 0.175],
    [0.073, 0.265, 0.19],
    [0.052, 0.23, 0.175],
  ],
  pinky: [
    [0.245, 0.205, 0.06],
    [0.215, 0.27, 0.115],
    [0.178, 0.255, 0.165],
    [0.142, 0.22, 0.18],
    [0.112, 0.19, 0.165],
  ],
};

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
    const close = smoothstep((curl - 0.25) / 0.75);
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
      const [targetX, targetY, targetZ] = CAN_GRASP_JOINT_TARGETS[finger.name][index];
      if (finger.name === "thumb") {
        x += close * 0.028 * (index + 1);
      }
      x = x * (1 - close) + targetX * close;
      y = y * (1 - close) + targetY * close;
      z = z * (1 - close) + targetZ * close;
      joints[`${finger.name}_${FINGER_JOINTS[index]}`] = { x, y, z };
    });
  });
  keepFingerJointsOutsideCan(joints, frame);
  keepFingersOnPartialCanWrap(joints, frame);
  return joints;
}

function canInHandSpace(frame) {
  const rigPosition = new THREE.Vector3(frame.x * 1.8, frame.y * 1.8 + SCENE_Y_OFFSET, frame.z * 1.8);
  const rigRotation = new THREE.Euler(-0.35 + frame.pitch, frame.yaw, frame.roll);
  const inverseRig = new THREE.Quaternion().setFromEuler(rigRotation).invert();
  return {
    center: CAN_WORLD_CENTER.clone().sub(rigPosition).applyQuaternion(inverseRig).divideScalar(HAND_SCALE),
    axis: new THREE.Vector3(0, 1, 0).applyQuaternion(inverseRig).normalize(),
    radius: CAN_RADIUS / HAND_SCALE,
    halfHeight: CAN_HALF_HEIGHT / HAND_SCALE,
  };
}

function keepFingerJointsOutsideCan(joints, frame) {
  const hardLock = frame.keyframeLock ? 1 : 0;
  const gripClose = smoothstep((frame.grip - 0.32) / 0.68);
  const can = canInHandSpace(frame);
  const approachGuard = 0.16 * smoothstep((0.74 - can.center.length()) / 0.3);

  for (let pass = 0; pass < 3; pass += 1) {
    FINGERS.flatMap((finger) =>
      FINGER_JOINTS.map((joint, index) => ({
        name: `${finger.name}_${joint}`,
        clearance: (index >= 3 ? 0.06 : 0.045) / HAND_SCALE,
        fallback: new THREE.Vector3(finger.base[0] || 0.01, 0, 0.12).normalize(),
      }))
    ).forEach(({ name, clearance, fallback }) => {
      const pose = joints[name];
      const correction = canCorrectionForPoint(pose, can, clearance, fallback);
      if (!correction) {
        return;
      }
      const penetration = smoothstep(correction.depth / correction.minimumDistance);
      const collisionStrength = hardLock || penetration > 0 ? 1 : Math.max(gripClose, approachGuard * penetration);
      pose.x += correction.vector.x * collisionStrength;
      pose.y += correction.vector.y * collisionStrength;
      pose.z += correction.vector.z * collisionStrength;
    });
  }
}

function canCorrectionForPoint(pose, can, clearance, fallback) {
  const point = new THREE.Vector3(pose.x, pose.y, pose.z);
  const offset = point.clone().sub(can.center);
  const axialDistance = offset.dot(can.axis);
  if (Math.abs(axialDistance) > can.halfHeight + 0.08) {
    return null;
  }
  const axial = can.axis.clone().multiplyScalar(axialDistance);
  const radial = offset.sub(axial);
  const radialDistance = radial.length();
  const minimumDistance = can.radius + clearance;
  if (radialDistance >= minimumDistance) {
    return null;
  }
  const normal = radialDistance > 0.001 ? radial.normalize() : fallback;
  const corrected = can.center.clone().add(axial).add(normal.multiplyScalar(minimumDistance + 0.002));
  return {
    depth: minimumDistance - radialDistance,
    minimumDistance,
    vector: corrected.sub(point),
  };
}

function keepFingersOnPartialCanWrap(joints, frame) {
  const close = smoothstep((frame.grip - 0.55) / 0.45);
  if (close <= 0) {
    return;
  }
  const can = canInHandSpace(frame);
  const floors = {
    index_dip: 0.22,
    index_tip: 0.20,
    middle_dip: 0.23,
    middle_tip: 0.21,
    ring_dip: 0.22,
    ring_tip: 0.20,
    pinky_dip: 0.17,
    pinky_tip: 0.15,
  };
  Object.entries(floors).forEach(([name, floor]) => {
    const pose = joints[name];
    if (!pose || pose.y >= floor) {
      return;
    }
    pose.y = frame.grip >= 0.75 ? floor : pose.y * (1 - close) + floor * close;
    keepPointOutsideCanAtCurrentY(pose, can, 0.06 / HAND_SCALE);
  });
}

function keepPointOutsideCanAtCurrentY(pose, can, clearance) {
  const point = new THREE.Vector3(pose.x, pose.y, pose.z);
  const offset = point.clone().sub(can.center);
  const axialDistance = offset.dot(can.axis);
  if (Math.abs(axialDistance) > can.halfHeight + 0.08) {
    return;
  }
  const axial = can.axis.clone().multiplyScalar(axialDistance);
  const radial = offset.sub(axial);
  radial.y = 0;
  const radialDistance = radial.length();
  const minimumDistance = can.radius + clearance + 0.004;
  if (radialDistance >= minimumDistance || radialDistance <= 0.001) {
    return;
  }
  radial.normalize().multiplyScalar(minimumDistance);
  const corrected = can.center.clone().add(axial).add(radial);
  pose.x = corrected.x;
  pose.z = corrected.z;
}

export function canClearanceMetrics(frame, joints = buildHandJoints(frame)) {
  const can = canInHandSpace(frame);
  let minClearance = Number.POSITIVE_INFINITY;
  let worstJoint = "";
  PALM_COLLISION_JOINTS.forEach((name) => {
    const pose = joints[name];
    const offset = new THREE.Vector3(pose.x, pose.y, pose.z).sub(can.center);
    const axialDistance = offset.dot(can.axis);
    if (Math.abs(axialDistance) > can.halfHeight + 0.08) {
      return;
    }
    const radialDistance = offset.sub(can.axis.clone().multiplyScalar(axialDistance)).length();
    const clearance = radialDistance - (can.radius + 0.09 / HAND_SCALE);
    if (clearance < minClearance) {
      minClearance = clearance;
      worstJoint = name;
    }
  });
  FINGERS.forEach((finger) => {
    FINGER_JOINTS.forEach((joint, index) => {
      const name = `${finger.name}_${joint}`;
      const pose = joints[name];
      const offset = new THREE.Vector3(pose.x, pose.y, pose.z).sub(can.center);
      const axialDistance = offset.dot(can.axis);
      if (Math.abs(axialDistance) > can.halfHeight + 0.08) {
        return;
      }
      const radialDistance = offset.sub(can.axis.clone().multiplyScalar(axialDistance)).length();
      const jointClearance = (index >= 3 ? 0.06 : 0.045) / HAND_SCALE;
      const clearance = radialDistance - (can.radius + jointClearance);
      if (clearance < minClearance) {
        minClearance = clearance;
        worstJoint = name;
      }
    });
  });
  return { minClearance, worstJoint };
}
