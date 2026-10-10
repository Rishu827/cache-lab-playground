import type { Summary } from "@cache-lab/sim-core";

/** Lowest windowed hit ratio between two times (inclusive start, exclusive end). */
export function minWindowHitRatio(s: Summary, fromMs: number, toMs: number): number | undefined {
  const w = s.windows.filter((x) => x.t >= fromMs && x.t < toMs && x.hits + x.misses > 0);
  return w.length ? Math.min(...w.map((x) => x.hitRatio)) : undefined;
}

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
export const ms = (x: number) => `${x.toFixed(0)}ms`;
