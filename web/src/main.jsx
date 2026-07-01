import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Pause, Play, RotateCcw } from "lucide-react";
import * as THREE from "three";
import "./styles.css";

const JOINTS = [
  "root",
  "pelvis",
  "spine_0",
  "spine_1",
  "neck",
  "head",
  "left_shoulder",
  "left_elbow",
  "left_wrist",
  "right_shoulder",
  "right_elbow",
  "right_wrist",
  "left_hip",
  "left_knee",
  "left_ankle",
  "right_hip",
  "right_knee",
  "right_ankle",
  "center_mass",
];

const BONES = [
  ["root", "pelvis"],
  ["pelvis", "spine_0"],
  ["spine_0", "spine_1"],
  ["spine_1", "neck"],
  ["neck", "head"],
  ["spine_1", "left_shoulder"],
  ["left_shoulder", "left_elbow"],
  ["left_elbow", "left_wrist"],
  ["spine_1", "right_shoulder"],
  ["right_shoulder", "right_elbow"],
  ["right_elbow", "right_wrist"],
  ["pelvis", "left_hip"],
  ["left_hip", "left_knee"],
  ["left_knee", "left_ankle"],
  ["pelvis", "right_hip"],
  ["right_hip", "right_knee"],
  ["right_knee", "right_ankle"],
  ["pelvis", "center_mass"],
];

function makeMaterial(color) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.08 });
}

function makeBoneMesh(color) {
  const geometry = new THREE.CylinderGeometry(0.035, 0.035, 1, 12);
  const mesh = new THREE.Mesh(geometry, makeMaterial(color));
  mesh.castShadow = true;
  return mesh;
}

function setBoneBetween(mesh, a, b) {
  const start = new THREE.Vector3(a.x, a.y, a.z);
  const end = new THREE.Vector3(b.x, b.y, b.z);
  const midpoint = start.clone().add(end).multiplyScalar(0.5);
  const length = start.distanceTo(end);

  mesh.position.copy(midpoint);
  mesh.scale.set(1, Math.max(length, 0.001), 1);
  mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), end.clone().sub(start).normalize());
}

function predictJoints(controls, elapsed) {
  const phase = (controls.phase + elapsed * controls.speed * 0.92) % 1;
  const wave = phase * Math.PI * 2;
  const swing = Math.sin(wave);
  const counter = Math.sin(wave + Math.PI);
  const lift = Math.abs(Math.cos(wave)) * 0.06 * controls.speed;
  const yaw = controls.turn * 0.45;
  const stride = controls.stride;
  const x = elapsed * controls.speed * 0.35;
  const zTurn = Math.sin(elapsed * controls.speed * 0.55) * controls.turn * 0.22;

  return {
    root: { x, y: lift, z: zTurn, ry: yaw },
    pelvis: { x, y: 0.92 + lift, z: zTurn, rx: 0.08 * swing, ry: yaw * 0.4 },
    spine_0: { x, y: 1.23 + lift, z: zTurn, rx: -0.06 * swing, ry: yaw * 0.25 },
    spine_1: { x, y: 1.55 + lift, z: zTurn, rx: -0.08 * swing, ry: yaw * 0.2 },
    neck: { x, y: 1.9 + lift, z: zTurn, rx: 0.03 * counter, ry: yaw * 0.15 },
    head: { x, y: 2.18 + lift, z: zTurn, rx: 0.02 * counter, ry: yaw * 0.1 },
    left_shoulder: { x: x - 0.34, y: 1.64 + lift, z: zTurn, rx: swing * controls.armDrive * 0.8, ry: yaw },
    left_elbow: { x: x - 0.53, y: 1.28 + lift - Math.max(0, swing) * 0.1, z: zTurn + swing * 0.18, rx: swing * controls.armDrive * 0.55 + 0.45 },
    left_wrist: { x: x - 0.6, y: 0.94 + lift - Math.max(0, swing) * 0.12, z: zTurn + swing * 0.27, rx: swing * controls.armDrive * 0.35 },
    right_shoulder: { x: x + 0.34, y: 1.64 + lift, z: zTurn, rx: counter * controls.armDrive * 0.8, ry: yaw },
    right_elbow: { x: x + 0.53, y: 1.28 + lift - Math.max(0, counter) * 0.1, z: zTurn + counter * 0.18, rx: counter * controls.armDrive * 0.55 + 0.45 },
    right_wrist: { x: x + 0.6, y: 0.94 + lift - Math.max(0, counter) * 0.12, z: zTurn + counter * 0.27, rx: counter * controls.armDrive * 0.35 },
    left_hip: { x: x - 0.18, y: 0.88 + lift, z: zTurn, rx: counter * controls.legDrive * stride * 0.75, ry: yaw * 0.3 },
    left_knee: { x: x - 0.22, y: 0.48 + Math.max(0, -counter) * 0.12, z: zTurn + counter * stride * 0.24, rx: Math.abs(counter) * controls.legDrive * stride * 0.95 },
    left_ankle: { x: x - 0.28 - counter * stride * 0.3, y: 0.07, z: zTurn + counter * stride * 0.32, rx: -Math.abs(counter) * 0.45 },
    right_hip: { x: x + 0.18, y: 0.88 + lift, z: zTurn, rx: swing * controls.legDrive * stride * 0.75, ry: yaw * 0.3 },
    right_knee: { x: x + 0.22, y: 0.48 + Math.max(0, -swing) * 0.12, z: zTurn + swing * stride * 0.24, rx: Math.abs(swing) * controls.legDrive * stride * 0.95 },
    right_ankle: { x: x + 0.28 - swing * stride * 0.3, y: 0.07, z: zTurn + swing * stride * 0.32, rx: -Math.abs(swing) * 0.45 },
    center_mass: { x, y: 1.2 + lift, z: zTurn, ry: yaw },
  };
}

function createRig(scene) {
  const rig = new THREE.Group();
  const jointMeshes = {};
  const boneMeshes = [];
  const accentJoints = new Set(["left_wrist", "right_wrist", "left_ankle", "right_ankle", "center_mass"]);

  JOINTS.forEach((joint) => {
    const color = accentJoints.has(joint) ? 0xf59e0b : joint.startsWith("left") || joint.startsWith("right") ? 0x14b8a6 : 0xe6edf5;
    const radius = joint === "head" ? 0.16 : joint === "center_mass" ? 0.055 : 0.07;
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(radius, 24, 16), makeMaterial(color));
    mesh.castShadow = true;
    jointMeshes[joint] = mesh;
    rig.add(mesh);
  });

  BONES.forEach(([from, to]) => {
    const mesh = makeBoneMesh(from.includes("hip") || to.includes("ankle") ? 0xf59e0b : 0x93c5fd);
    boneMeshes.push({ from, to, mesh });
    rig.add(mesh);
  });

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(10, 5),
    new THREE.MeshStandardMaterial({ color: 0x111923, roughness: 0.8 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  scene.add(rig);

  return { rig, jointMeshes, boneMeshes };
}

function applyMotion(parts, controls, elapsed) {
  const joints = predictJoints(controls, elapsed);
  const rootOffset = joints.root.x;

  JOINTS.forEach((joint) => {
    const pose = joints[joint];
    parts.jointMeshes[joint].position.set(pose.x - rootOffset, pose.y, pose.z);
    parts.jointMeshes[joint].rotation.set(pose.rx || 0, pose.ry || 0, pose.rz || 0);
  });

  parts.boneMeshes.forEach(({ from, to, mesh }) => {
    const a = joints[from];
    const b = joints[to];
    setBoneBetween(mesh, { ...a, x: a.x - rootOffset }, { ...b, x: b.x - rootOffset });
  });
  parts.rig.rotation.y = joints.root.ry;
}

function App() {
  const mountRef = useRef(null);
  const controlsRef = useRef({ speed: 1, phase: 0, armDrive: 1, legDrive: 1, stride: 1, turn: 0 });
  const [controls, setControls] = useState(controlsRef.current);
  const [running, setRunning] = useState(true);
  const [renderError, setRenderError] = useState("");
  const timeline = useMemo(() => {
    const ioMs = 300;
    const renderMs = 16;
    return {
      anchors: [0, ioMs, ioMs * 2, ioMs * 3],
      predictedFrames: Math.floor(ioMs / renderMs),
    };
  }, []);

  useEffect(() => {
    const mount = mountRef.current;
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    let renderer;
    const clock = new THREE.Clock();
    let frameId = 0;

    try {
      renderer = new THREE.WebGLRenderer({ antialias: true });
    } catch {
      setRenderError("WebGL is unavailable in this browser session.");
      return undefined;
    }

    scene.background = new THREE.Color(0x0b0f14);
    camera.position.set(0, 1.6, 4.4);
    camera.lookAt(0, 1.25, 0);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    mount.appendChild(renderer.domElement);

    const hemi = new THREE.HemisphereLight(0xb7d7ff, 0x1d2530, 1.7);
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(3, 5, 4);
    key.castShadow = true;
    scene.add(hemi, key);

    const parts = createRig(scene);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
    };

    const animate = () => {
      const elapsed = running ? clock.getElapsedTime() : 0;
      applyMotion(parts, controlsRef.current, elapsed);
      renderer.render(scene, camera);
      frameId = requestAnimationFrame(animate);
    };

    resize();
    animate();
    window.addEventListener("resize", resize);

    return () => {
      cancelAnimationFrame(frameId);
      window.removeEventListener("resize", resize);
      renderer.dispose();
      mount.removeChild(renderer.domElement);
    };
  }, [running]);

  function updateControl(key, value) {
    const next = { ...controlsRef.current, [key]: Number(value) };
    controlsRef.current = next;
    setControls(next);
  }

  function resetControls() {
    const next = { speed: 1, phase: 0, armDrive: 1, legDrive: 1, stride: 1, turn: 0 };
    controlsRef.current = next;
    setControls(next);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p>300ms IO anchors / 16ms joint prediction</p>
          <h1>Dephy Motion Rig</h1>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={() => setRunning(!running)} title={running ? "Pause" : "Play"}>
            {running ? <Pause size={18} /> : <Play size={18} />}
            <span>{running ? "Pause" : "Play"}</span>
          </button>
          <button type="button" onClick={resetControls} title="Reset controls">
            <RotateCcw size={18} />
            <span>Reset</span>
          </button>
        </div>
      </section>

      <section className="stage-row">
        <div className="stage" ref={mountRef} />
        {renderError ? <div className="render-error">{renderError}</div> : null}
        <aside className="control-panel">
          {[
            ["speed", "Speed", 0, 3, 0.05],
            ["phase", "Phase", 0, 1, 0.01],
            ["armDrive", "Arm", 0, 1.8, 0.05],
            ["legDrive", "Leg", 0, 1.8, 0.05],
            ["stride", "Stride", 0.2, 2, 0.05],
            ["turn", "Turn", -1, 1, 0.05],
          ].map(([key, label, min, max, step]) => (
            <label key={key}>
              <span>{label}</span>
              <input type="range" min={min} max={max} step={step} value={controls[key]} onChange={(event) => updateControl(key, event.target.value)} />
              <strong>{controls[key].toFixed(2)}</strong>
            </label>
          ))}

          <div className="timeline">
            <div className="timeline-head">
              <span>IO sample</span>
              <strong>300ms</strong>
            </div>
            <div className="ticks">
              {timeline.anchors.map((tick) => (
                <span key={tick}>{tick}</span>
              ))}
            </div>
            <div className="timeline-head">
              <span>Predicted frames</span>
              <strong>{timeline.predictedFrames}/gap</strong>
            </div>
          </div>

          <div className="mapping">
            <code>slot1:di:1:1 run gate</code>
            <code>slot2:ai:1:80 speed target</code>
            <code>slot3:ai:2:65 stride</code>
            <code>slot4:relay:1:0 motion lock</code>
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
