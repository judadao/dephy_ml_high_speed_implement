import { Pause, Play, RotateCcw } from "lucide-react";
import { playButtonState } from "./playbackController.js";

export function DemoHeader({ playMode, running, onReset, onTogglePlayback }) {
  const playState = playButtonState({ playMode, running });
  return (
    <section className="hero">
      <div>
        <p>single palm keyframes / loaded device stream / loaded prediction policy</p>
        <h1>Hand Prediction Demo</h1>
      </div>
      <div className="hero-actions">
        <button type="button" onClick={onTogglePlayback} title={playState.title} disabled={playState.disabled}>
          {running && !playState.disabled ? <Pause size={18} /> : <Play size={18} />}
          <span>{playState.label}</span>
        </button>
        <button type="button" onClick={onReset} title="Reset demo">
          <RotateCcw size={18} />
          <span>Reset</span>
        </button>
      </div>
    </section>
  );
}
