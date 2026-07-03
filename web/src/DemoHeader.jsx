import { Pause, Play, RotateCcw } from "lucide-react";

export function DemoHeader({ running, onReset, onTogglePlayback }) {
  return (
    <section className="hero">
      <div>
        <p>single palm keyframes / loaded device stream / loaded prediction policy</p>
        <h1>Hand Prediction Demo</h1>
      </div>
      <div className="hero-actions">
        <button type="button" onClick={onTogglePlayback} title={running ? "Pause" : "Play"}>
          {running ? <Pause size={18} /> : <Play size={18} />}
          <span>{running ? "Pause" : "Play"}</span>
        </button>
        <button type="button" onClick={onReset} title="Reset demo">
          <RotateCcw size={18} />
          <span>Reset</span>
        </button>
      </div>
    </section>
  );
}
