#!/usr/bin/env python3
"""Train a small single-palm policy with dependency-free policy search."""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path

from hand_rl_env import HandPalmEnv, load_keyframes, policy_action


def evaluate(policy: dict[str, float], scenario_paths: list[Path], episodes: int = 1) -> dict[str, float]:
    total_reward = 0.0
    successes = 0
    final_error = 0.0
    steps = 0
    runs = 0

    for path in scenario_paths:
        for _ in range(episodes):
            env = HandPalmEnv(load_keyframes(path))
            observation = env.reset()
            done = False
            info = {"error": 999.0, "success": False}
            while not done:
                action = policy_action(observation, policy)
                observation, reward, done, info = env.step(action)
                total_reward += reward
                steps += 1
            successes += 1 if info.get("success") else 0
            final_error += float(info.get("error", 999.0))
            runs += 1

    return {
        "reward": total_reward / max(runs, 1),
        "success_rate": successes / max(runs, 1),
        "avg_final_error": final_error / max(runs, 1),
        "avg_steps": steps / max(runs, 1),
    }


def mutate(policy: dict[str, float], rng: random.Random, scale: float) -> dict[str, float]:
    bounds = {
        "kp_pos": (1.0, 14.0),
        "kd_pos": (0.0, 4.0),
        "kp_rot": (0.5, 8.0),
        "kp_grip": (0.5, 10.0),
        "speed_scale": (0.1, 1.0),
    }
    next_policy = dict(policy)
    for key, (low, high) in bounds.items():
        span = high - low
        next_policy[key] = max(low, min(high, next_policy[key] + rng.uniform(-span, span) * scale))
    return next_policy


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--scenario", action="append", required=True)
    parser.add_argument("--out", required=True)
    parser.add_argument("--iterations", type=int, default=80)
    parser.add_argument("--seed", type=int, default=7)
    args = parser.parse_args()

    scenarios = [Path(item) for item in args.scenario]
    rng = random.Random(args.seed)
    best_policy = {
        "format": "dephy_hand_policy_v1",
        "kp_pos": 6.0,
        "kd_pos": 1.2,
        "kp_rot": 3.0,
        "kp_grip": 3.0,
        "speed_scale": 0.8,
    }
    best_metrics = evaluate(best_policy, scenarios)

    for iteration in range(args.iterations):
        scale = max(0.02, 0.22 * (1.0 - iteration / max(args.iterations, 1)))
        candidate = mutate(best_policy, rng, scale)
        metrics = evaluate(candidate, scenarios)
        if (
            metrics["success_rate"] > best_metrics["success_rate"]
            or (
                metrics["success_rate"] == best_metrics["success_rate"]
                and metrics["reward"] > best_metrics["reward"]
            )
        ):
            best_policy = candidate
            best_metrics = metrics

    artifact = {
        **best_policy,
        "training": {
            "algorithm": "dependency_free_policy_search",
            "iterations": args.iterations,
            "seed": args.seed,
            "scenarios": [str(path) for path in scenarios],
            "metrics": best_metrics,
        },
    }
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    Path(args.out).write_text(json.dumps(artifact, indent=2, sort_keys=True) + "\n")
    print(json.dumps(best_metrics, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
