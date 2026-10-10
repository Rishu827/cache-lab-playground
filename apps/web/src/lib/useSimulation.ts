import { Simulation, type Action, type RequestEvent, type SimConfig, type Summary } from "@cache-lab/sim-core";
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";

const UI_INTERVAL_MS = 66; // throttle React renders (~15fps); the engine is never throttled
const MAX_EVENTS_PER_FRAME = 30_000;
const RECENT_LIMIT = 40;

export interface SimView {
  sim: Simulation;
  summary: Summary;
  /** Requests completed since the previous render, for animation. */
  recent: RequestEvent[];
  playing: boolean;
  speed: number;
  setSpeed(n: number): void;
  play(): void;
  pause(): void;
  step(): void;
  reset(): void;
  inject(a: Action): void;
}

export function useSimulation(config: SimConfig): SimView {
  const [, rerender] = useReducer((n: number) => n + 1, 0);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(5);
  const recentRef = useRef<RequestEvent[]>([]);
  const resetCount = useRef(0);
  const [resetKey, setResetKey] = useState(0);

  const sim = useMemo(() => {
    const s = new Simulation(config);
    s.onRequest = (e) => {
      recentRef.current.push(e);
      if (recentRef.current.length > RECENT_LIMIT) recentRef.current.shift();
    };
    return s;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, resetKey]);

  const simRef = useRef(sim);
  simRef.current = sim;
  const speedRef = useRef(speed);
  speedRef.current = speed;

  // Config changes (or reset) restart the run from t=0 and clear animation state.
  useEffect(() => {
    recentRef.current = [];
  }, [sim]);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let last = performance.now();
    let lastPaint = 0;
    const frame = (nowReal: number) => {
      const s = simRef.current;
      const dt = Math.min(nowReal - last, 100);
      last = nowReal;
      s.advanceTo(s.now + dt * speedRef.current, MAX_EVENTS_PER_FRAME);
      if (nowReal - lastPaint >= UI_INTERVAL_MS) {
        lastPaint = nowReal;
        rerender();
      }
      if (s.done) {
        setPlaying(false);
        rerender();
        return;
      }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf);
  }, [playing, sim]);

  const recent = recentRef.current;
  recentRef.current = [];

  const play = useCallback(() => {
    if (!simRef.current.done) setPlaying(true);
  }, []);
  const pause = useCallback(() => setPlaying(false), []);
  const step = useCallback(() => {
    setPlaying(false);
    simRef.current.step();
    rerender();
  }, []);
  const reset = useCallback(() => {
    setPlaying(false);
    resetCount.current++;
    setResetKey(resetCount.current);
  }, []);
  const inject = useCallback((a: Action) => {
    simRef.current.inject(a);
    rerender();
  }, []);

  return { sim, summary: sim.summary(), recent, playing, speed, setSpeed, play, pause, step, reset, inject };
}
