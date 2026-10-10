import type { Summary } from "@cache-lab/sim-core";

/** Hit ratio aggregated over all windows starting in [fromMs, toMs), or undefined if none have reads. */
export function hitRatioBetween(s: Summary, fromMs: number, toMs: number): number | undefined {
  const w = s.windows.filter((x) => x.t >= fromMs && x.t < toMs);
  const hits = w.reduce((a, x) => a + x.hits, 0);
  const misses = w.reduce((a, x) => a + x.misses, 0);
  return hits + misses > 0 ? hits / (hits + misses) : undefined;
}

export const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
export const ms = (x: number) => `${x.toFixed(0)}ms`;
