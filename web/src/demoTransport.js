export function fetchInitialDemoData({ urls, onSampleKeyframes, onRuntimeAnchors, onPredictionSegments, onResult }) {
  return Promise.all([
    fetch(urls.sampleKeyframes, { cache: "no-store" }).then((response) => (response.ok ? response.text() : "")),
    fetch(urls.runtimeAnchors, { cache: "no-store" }).then((response) => (response.ok ? response.text() : "")),
    fetch(urls.predictionSegments, { cache: "no-store" }).then((response) => (response.ok ? response.text() : "")),
    fetch(urls.result, { cache: "no-store" }).then((response) => (response.ok ? response.text() : "")),
  ]).then(([sampleText, anchorText, segmentText, resultText]) => {
    if (sampleText) {
      onSampleKeyframes(sampleText);
    }
    if (anchorText) {
      onRuntimeAnchors(anchorText);
    }
    if (segmentText) {
      onPredictionSegments(segmentText);
    }
    if (resultText) {
      onResult(resultText);
    }
  });
}

export function connectDemoEvents({ onSampleKeyframes, onRuntimeAnchors, onPolicy, onPredictionSegments, onResult, onStatus }) {
  if (!window.EventSource) {
    onStatus("sse unavailable");
    return null;
  }

  const events = new EventSource("/demo/events");
  events.addEventListener("open", () => onStatus("sse connected"));
  events.addEventListener("ready", () => onStatus("sse connected"));
  events.addEventListener("sample_keyframes", (event) => onSampleKeyframes(JSON.parse(event.data)));
  events.addEventListener("runtime_anchors", (event) => onRuntimeAnchors(JSON.parse(event.data)));
  events.addEventListener("policy", (event) => onPolicy(JSON.parse(event.data)));
  events.addEventListener("prediction_segments", (event) => onPredictionSegments(JSON.parse(event.data)));
  events.addEventListener("result", (event) => onResult(JSON.parse(event.data)));
  events.onerror = () => onStatus("sse reconnecting");
  return events;
}
