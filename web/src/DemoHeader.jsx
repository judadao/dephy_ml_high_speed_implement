import { Pause, Play, RotateCcw } from "lucide-react";

export function DemoHeader({ playDisabled = false, running, onReset, onTogglePlayback }) {
  const playLabel = playDisabled ? "Manual" : running ? "Pause" : "Play";
  return (
    <section className="hero">
      <div>
        <p>single palm keyframes / loaded device stream / loaded prediction policy</p>
        <h1>Hand Prediction Demo</h1>
      </div>
      <div className="hero-actions">
        <button type="button" onClick={onTogglePlayback} title={playDisabled ? "Anchors are manual review only" : playLabel} disabled={playDisabled}>
          {running && !playDisabled ? <Pause size={18} /> : <Play size={18} />}
          <span>{playLabel}</span>
        </button>
        <button type="button" onClick={onReset} title="Reset demo">
          <RotateCcw size={18} />
          <span>Reset</span>
        </button>
      </div>
    </section>
  );
}
