#!/usr/bin/env node
import fs from "node:fs";
import { canClearanceMetrics } from "../web/src/handRig.js";

function usage() {
  console.error("usage: validate_hand_keyframe_clearance.mjs --keyframes <csv> [--min-clearance <meters>]");
}

function parseArgs(argv) {
  const args = { minClearance: 0 };
  for (let index = 2; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--keyframes") {
      args.keyframes = argv[index + 1];
      index += 1;
    } else if (arg === "--min-clearance") {
      args.minClearance = Number(argv[index + 1]);
      index += 1;
    } else {
      usage();
      process.exit(2);
    }
  }
  if (!args.keyframes) {
    usage();
    process.exit(2);
  }
  return args;
}

function parseCsv(text) {
  const [headerLine, ...rows] = text.trim().split(/\r?\n/);
  const headers = headerLine.split(",");
  return rows.filter(Boolean).map((row) => {
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
      keyframeLock: true,
    };
  });
}

const args = parseArgs(process.argv);
const frames = parseCsv(fs.readFileSync(args.keyframes, "utf8"));
let worst = { minClearance: Number.POSITIVE_INFINITY, frame: null, worstJoint: "" };
const failures = [];

frames.forEach((frame) => {
  const metrics = canClearanceMetrics(frame);
  if (metrics.minClearance < worst.minClearance) {
    worst = { ...metrics, frame };
  }
  if (metrics.minClearance < args.minClearance - 1e-9) {
    failures.push({ frame, ...metrics });
  }
});

if (failures.length > 0) {
  console.error(`hand keyframe clearance failed: ${failures.length} penetrating keyframes`);
  failures.slice(0, 10).forEach(({ frame, minClearance, worstJoint }) => {
    console.error(`${frame.frame_id}@${frame.t_ms}ms ${worstJoint} clearance=${minClearance.toFixed(6)}`);
  });
  process.exit(1);
}

console.log(
  `hand keyframe clearance ok: ${frames.length} keyframes, min=${worst.minClearance.toFixed(6)} at ${worst.frame?.frame_id ?? "n/a"} ${worst.worstJoint}`
);
