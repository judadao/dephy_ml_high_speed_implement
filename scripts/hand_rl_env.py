#!/usr/bin/env python3
"""Single-palm reinforcement-learning environment.

The environment is intentionally dependency-free so it can run on small Linux
machines and in CI. A policy controls position, rotation, and grip deltas while
the environment rewards target progress, smoothness, and safe completion.
"""

from __future__ import annotations

import csv
import math
from dataclasses import dataclass
from pathlib import Path


@dataclass
class HandKeyframe:
    frame_id: str
    t_ms: int
    x: float
    y: float
    z: float
    yaw: float
    pitch: float
    roll: float
    grip: float
    hold_ms: int
    tolerance: float
    safety_hold: bool


@dataclass
class HandState:
    t_ms: int = 0
    x: float = 0.0
    y: float = 0.0
    z: float = 0.0
    yaw: float = 0.0
    pitch: float = 0.0
    roll: float = 0.0
    grip: float = 0.0
    vx: float = 0.0
    vy: float = 0.0
    vz: float = 0.0
    last_action: tuple[float, float, float, float, float, float, float, float] = (0.0,) * 8


def clamp(value: float, low: float, high: float) -> float:
    return max(low, min(high, value))


def load_keyframes(path: str | Path) -> list[HandKeyframe]:
    keyframes: list[HandKeyframe] = []
    with Path(path).open(newline="") as fp:
        for row in csv.DictReader(fp):
            keyframes.append(
                HandKeyframe(
                    frame_id=row["frame_id"],
                    t_ms=int(row["t_ms"]),
                    x=float(row["x"]),
                    y=float(row["y"]),
                    z=float(row["z"]),
                    yaw=float(row["yaw"]),
                    pitch=float(row["pitch"]),
                    roll=float(row["roll"]),
                    grip=float(row["grip"]),
                    hold_ms=int(row["hold_ms"]),
                    tolerance=float(row["tolerance"]),
                    safety_hold=bool(int(row["safety_hold"])),
                )
            )
    if not keyframes:
        raise ValueError(f"no keyframes: {path}")
    return keyframes


class HandPalmEnv:
    def __init__(self, keyframes: list[HandKeyframe], render_ms: int = 16, max_steps: int = 1600):
        self.keyframes = keyframes
        self.render_ms = render_ms
        self.max_steps = max_steps
        self.state = HandState()
        self.target_index = 1
        self.steps = 0
        self.prev_error = 0.0
        self.hold_ms = 0

    def reset(self) -> list[float]:
        start = self.keyframes[0]
        self.state = HandState(
            t_ms=start.t_ms,
            x=start.x,
            y=start.y,
            z=start.z,
            yaw=start.yaw,
            pitch=start.pitch,
            roll=start.roll,
            grip=start.grip,
        )
        self.target_index = 1 if len(self.keyframes) > 1 else 0
        self.steps = 0
        self.hold_ms = 0
        self.prev_error = self.error(self.target)
        return self.observation()

    @property
    def target(self) -> HandKeyframe:
        return self.keyframes[self.target_index]

    def error(self, target: HandKeyframe | None = None) -> float:
        target = target or self.target
        pos = math.dist((self.state.x, self.state.y, self.state.z), (target.x, target.y, target.z))
        rot = math.dist(
            (self.state.yaw, self.state.pitch, self.state.roll),
            (target.yaw, target.pitch, target.roll),
        ) * 0.2
        grip = abs(self.state.grip - target.grip) * 0.1
        return pos + rot + grip

    def observation(self) -> list[float]:
        t = self.target
        err_x = t.x - self.state.x
        err_y = t.y - self.state.y
        err_z = t.z - self.state.z
        return [
            self.state.x,
            self.state.y,
            self.state.z,
            self.state.yaw,
            self.state.pitch,
            self.state.roll,
            self.state.grip,
            t.x,
            t.y,
            t.z,
            t.yaw,
            t.pitch,
            t.roll,
            t.grip,
            err_x,
            err_y,
            err_z,
            t.yaw - self.state.yaw,
            t.pitch - self.state.pitch,
            t.roll - self.state.roll,
            t.grip - self.state.grip,
            self.state.vx,
            self.state.vy,
            self.state.vz,
            *self.state.last_action,
            1.0 if t.safety_hold else 0.0,
        ]

    def step(self, action: tuple[float, float, float, float, float, float, float, float]):
        t = self.target
        dt = self.render_ms / 1000.0
        previous_error = self.error(t)

        if t.safety_hold:
            action = (0.0,) * 8

        speed_scale = clamp(action[7], 0.05, 1.0)
        dx = clamp(action[0], -1.0, 1.0) * dt * speed_scale
        dy = clamp(action[1], -1.0, 1.0) * dt * speed_scale
        dz = clamp(action[2], -1.0, 1.0) * dt * speed_scale
        max_rot = 3.2 * dt * speed_scale
        max_grip = 4.0 * dt * speed_scale

        old_x, old_y, old_z = self.state.x, self.state.y, self.state.z
        self.state.x += dx
        self.state.y += dy
        self.state.z += dz
        self.state.yaw += clamp(action[3], -max_rot, max_rot)
        self.state.pitch += clamp(action[4], -max_rot, max_rot)
        self.state.roll += clamp(action[5], -max_rot, max_rot)
        self.state.grip = clamp(self.state.grip + clamp(action[6], -max_grip, max_grip), 0.0, 1.0)
        self.state.vx = (self.state.x - old_x) / dt
        self.state.vy = (self.state.y - old_y) / dt
        self.state.vz = (self.state.z - old_z) / dt
        self.state.t_ms += self.render_ms
        self.state.last_action = action
        self.steps += 1

        current_error = self.error(t)
        progress = previous_error - current_error
        action_energy = sum(v * v for v in action[:7])
        reward = progress * 20.0 - action_energy * 0.01 - 0.002

        reached = current_error <= max(t.tolerance, 0.005)
        if reached:
            self.hold_ms += self.render_ms
            reward += 1.0
        else:
            self.hold_ms = 0

        if current_error > previous_error + 0.02:
            reward -= 0.5
        if t.safety_hold and any(abs(v) > 0.0001 for v in action):
            reward -= 2.0

        done = False
        success = False
        if reached and self.hold_ms >= t.hold_ms:
            if self.target_index + 1 < len(self.keyframes):
                self.target_index += 1
                self.hold_ms = 0
            else:
                done = True
                success = True
                reward += 5.0
        if self.steps >= self.max_steps:
            done = True

        info = {"error": current_error, "target": t.frame_id, "success": success}
        return self.observation(), reward, done, info


def policy_action(observation: list[float], policy: dict[str, float]):
    err_x, err_y, err_z = observation[14], observation[15], observation[16]
    err_yaw, err_pitch, err_roll = observation[17], observation[18], observation[19]
    err_grip = observation[20]
    vx, vy, vz = observation[21], observation[22], observation[23]
    kp_pos = policy.get("kp_pos", 5.0)
    kd_pos = policy.get("kd_pos", 1.0)
    kp_rot = policy.get("kp_rot", 2.5)
    kp_grip = policy.get("kp_grip", 2.5)
    speed_scale = policy.get("speed_scale", 0.75)
    return (
        clamp(err_x * kp_pos - vx * kd_pos, -1.0, 1.0),
        clamp(err_y * kp_pos - vy * kd_pos, -1.0, 1.0),
        clamp(err_z * kp_pos - vz * kd_pos, -1.0, 1.0),
        clamp(err_yaw * kp_rot, -1.0, 1.0),
        clamp(err_pitch * kp_rot, -1.0, 1.0),
        clamp(err_roll * kp_rot, -1.0, 1.0),
        clamp(err_grip * kp_grip, -1.0, 1.0),
        clamp(speed_scale, 0.05, 1.0),
    )
