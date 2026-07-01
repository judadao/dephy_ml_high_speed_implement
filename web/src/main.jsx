import React, { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import { Pause, Play, RotateCcw } from "lucide-react";
import * as THREE from "three";
import "./styles.css";

function makeLimb(radius, length, color) {
  const group = new THREE.Group();
  const geometry = new THREE.CylinderGeometry(radius, radius, length, 12);
  const material = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.05 });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.position.y = -length / 2;
  mesh.castShadow = true;
  group.add(mesh);
  return group;
}

function createRig(scene) {
  const rig = new THREE.Group();
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: 0xe6edf5, roughness: 0.45 });
  const accent = 0x14b8a6;
  const legColor = 0xf59e0b;

  const torso = new THREE.Mesh(new THREE.CapsuleGeometry(0.32, 1.05, 8, 16), bodyMaterial);
  torso.position.y = 1.65;
  torso.castShadow = true;
  rig.add(torso);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.25, 24, 16), new THREE.MeshStandardMaterial({ color: 0xf5ecd6 }));
  head.position.y = 2.55;
  head.castShadow = true;
  rig.add(head);

  const leftArm = makeLimb(0.075, 0.9, accent);
  const rightArm = makeLimb(0.075, 0.9, accent);
  leftArm.position.set(-0.38, 2.05, 0);
  rightArm.position.set(0.38, 2.05, 0);
  rig.add(leftArm, rightArm);

  const leftLeg = makeLimb(0.09, 1.05, legColor);
  const rightLeg = makeLimb(0.09, 1.05, legColor);
  leftLeg.position.set(-0.18, 1.08, 0);
  rightLeg.position.set(0.18, 1.08, 0);
  rig.add(leftLeg, rightLeg);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(8, 5),
    new THREE.MeshStandardMaterial({ color: 0x111923, roughness: 0.8 })
  );
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);

  scene.add(rig);
  return { rig, leftArm, rightArm, leftLeg, rightLeg };
}

function applyMotion(parts, controls, elapsed) {
  const phase = controls.phase + elapsed * controls.speed * 2.8;
  const swing = Math.sin(phase * Math.PI * 2);
  const counter = Math.sin(phase * Math.PI * 2 + Math.PI);
  const bob = Math.abs(Math.cos(phase * Math.PI * 2)) * 0.08 * controls.speed;

  parts.rig.position.y = bob;
  parts.rig.rotation.y = Math.sin(phase * Math.PI * 2) * 0.08;
  parts.leftArm.rotation.x = swing * controls.armDrive * 1.1;
  parts.rightArm.rotation.x = counter * controls.armDrive * 1.1;
  parts.leftLeg.rotation.x = counter * controls.legDrive * 0.9;
  parts.rightLeg.rotation.x = swing * controls.legDrive * 0.9;
}

function App() {
  const mountRef = useRef(null);
  const controlsRef = useRef({ speed: 1, phase: 0, armDrive: 1, legDrive: 1 });
  const [controls, setControls] = useState(controlsRef.current);
  const [running, setRunning] = useState(true);
  const [renderError, setRenderError] = useState("");

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
    camera.position.set(0, 2.0, 5.2);
    camera.lookAt(0, 1.45, 0);
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
      const elapsed = clock.getElapsedTime();
      applyMotion(parts, controlsRef.current, running ? elapsed : 0);
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
    const next = { speed: 1, phase: 0, armDrive: 1, legDrive: 1 };
    controlsRef.current = next;
    setControls(next);
  }

  return (
    <main className="app-shell">
      <section className="hero">
        <div>
          <p>3D IO motion sandbox</p>
          <h1>Dephy 3D Motion Rig</h1>
        </div>
        <div className="hero-actions">
          <button type="button" onClick={() => setRunning(!running)}>
            {running ? <Pause size={18} /> : <Play size={18} />}
            <span>{running ? "Pause" : "Play"}</span>
          </button>
          <button type="button" onClick={resetControls}>
            <RotateCcw size={18} />
            <span>Reset</span>
          </button>
        </div>
      </section>

      <section className="stage-row">
        <div className="stage" ref={mountRef} />
        {renderError ? <div className="render-error">{renderError}</div> : null}
        <aside className="control-panel">
          <label>
            <span>Speed</span>
            <input type="range" min="0" max="3" step="0.05" value={controls.speed} onChange={(event) => updateControl("speed", event.target.value)} />
            <strong>{controls.speed.toFixed(2)}</strong>
          </label>
          <label>
            <span>Phase</span>
            <input type="range" min="0" max="1" step="0.01" value={controls.phase} onChange={(event) => updateControl("phase", event.target.value)} />
            <strong>{controls.phase.toFixed(2)}</strong>
          </label>
          <label>
            <span>Arm Drive</span>
            <input type="range" min="0" max="1.8" step="0.05" value={controls.armDrive} onChange={(event) => updateControl("armDrive", event.target.value)} />
            <strong>{controls.armDrive.toFixed(2)}</strong>
          </label>
          <label>
            <span>Leg Drive</span>
            <input type="range" min="0" max="1.8" step="0.05" value={controls.legDrive} onChange={(event) => updateControl("legDrive", event.target.value)} />
            <strong>{controls.legDrive.toFixed(2)}</strong>
          </label>
          <div className="mapping">
            <code>slot1 DI 1 1 → speed gate</code>
            <code>slot3 AI 2 42 → arm drive</code>
            <code>slot5 RELAY 3 1 → leg drive</code>
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
