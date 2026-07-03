import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { buildHandJoints, FINGER_JOINTS, FINGERS, HAND_SCALE, SCENE_Y_OFFSET } from "./handRig.js";

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

export function HandScene({ frame, ready }) {
  const mountRef = useRef(null);
  const frameRef = useRef(frame);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    frameRef.current = frame;
  }, [frame]);

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount || !ready || !frameRef.current) {
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
  }, [ready]);

  return (
    <div className="stage" ref={mountRef}>
      {renderError ? <HandFallback frame={frame} /> : null}
    </div>
  );
}
