import fs from "node:fs";
import path from "node:path";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const demoFiles = {
  sample_keyframes: "demo/sample_keyframes.csv",
  runtime_io: "demo/runtime_io.csv",
  runtime_anchors: "demo/runtime_anchors.jsonl",
  policy: "demo/hand_policy.json",
  prediction_segments: "demo/hand_sequence/prediction_segments.jsonl",
  result: "demo/hand_sequence/result.json",
};
const demoRecordLimit = 15;
const csvTailEvents = new Set(["sample_keyframes", "runtime_io"]);
const jsonlTailEvents = new Set(["runtime_anchors", "prediction_segments"]);

function tailDemoText(event, data) {
  const lines = data.trimEnd().split(/\r?\n/);
  if (csvTailEvents.has(event) && lines.length > demoRecordLimit + 1) {
    return [lines[0], ...lines.slice(-demoRecordLimit)].join("\n") + "\n";
  }
  if (jsonlTailEvents.has(event) && lines.length > demoRecordLimit) {
    return lines.slice(-demoRecordLimit).join("\n") + "\n";
  }
  return data;
}

function sendEvent(res, event, filePath) {
  fs.readFile(filePath, "utf8", (error, data) => {
    if (error) {
      res.write(`event: ${event}:error\n`);
      res.write(`data: ${JSON.stringify({ message: error.message })}\n\n`);
      return;
    }
    res.write(`event: ${event}\n`);
    res.write(`data: ${JSON.stringify(tailDemoText(event, data))}\n\n`);
  });
}

function realtimeDemoEvents() {
  return {
    name: "dephy-realtime-demo-events",
    configureServer(server) {
      server.middlewares.use("/demo/events", (req, res) => {
        if (req.method !== "GET") {
          res.statusCode = 405;
          res.end();
          return;
        }

        const publicDir = server.config.publicDir;
        const files = Object.fromEntries(Object.entries(demoFiles).map(([event, relative]) => [event, path.join(publicDir, relative)]));
        res.writeHead(200, {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache, no-transform",
          Connection: "keep-alive",
          "X-Accel-Buffering": "no",
        });
        res.write("event: ready\n");
        res.write(`data: ${JSON.stringify({ source: "vite", files: demoFiles })}\n\n`);

        Object.entries(files).forEach(([event, filePath]) => sendEvent(res, event, filePath));

        const watchers = Object.entries(files).map(([event, filePath]) => {
          const listener = () => sendEvent(res, event, filePath);
          fs.watchFile(filePath, { interval: 200 }, listener);
          return [filePath, listener];
        });

        const heartbeat = setInterval(() => {
          res.write("event: heartbeat\n");
          res.write(`data: ${JSON.stringify({ t: Date.now() })}\n\n`);
        }, 15000);

        req.on("close", () => {
          clearInterval(heartbeat);
          watchers.forEach(([filePath, listener]) => fs.unwatchFile(filePath, listener));
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), realtimeDemoEvents()],
});
