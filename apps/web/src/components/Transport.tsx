import type { SimView } from "../lib/useSimulation";

const SPEEDS = [1, 2, 5, 10, 25, 50, 100];

interface Props {
  view: SimView;
  seed: number;
  onSeed(n: number): void;
  durationMs: number;
}

export function Transport({ view, seed, onSeed, durationMs }: Props) {
  const { sim, playing } = view;
  const pctDone = Math.min(100, (sim.now / durationMs) * 100);
  return (
    <div className="transport" role="group" aria-label="Simulation transport">
      {playing ? <button onClick={view.pause} aria-keyshortcuts="Space">⏸ Pause</button> : <button className="primary" onClick={view.play} disabled={sim.done} aria-keyshortcuts="Space">▶ Play</button>}
      <button onClick={view.step} disabled={sim.done} title="Process a single event">⏭ Step</button>
      <button onClick={view.reset}>↺ Reset</button>
      <label className="inline">
        Speed
        <select value={view.speed} onChange={(e) => view.setSpeed(Number(e.target.value))}>
          {SPEEDS.map((s) => (
            <option key={s} value={s}>{s}×</option>
          ))}
        </select>
      </label>
      <label className="inline">
        Seed
        <input type="number" value={seed} onChange={(e) => onSeed(Math.trunc(Number(e.target.value)) || 0)} />
      </label>
      <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(pctDone)} aria-label="Run progress">
        <div style={{ width: `${pctDone}%` }} />
        <span>{(sim.now / 1000).toFixed(1)}s / {(durationMs / 1000).toFixed(0)}s{sim.done ? " · finished" : ""}</span>
      </div>
    </div>
  );
}
