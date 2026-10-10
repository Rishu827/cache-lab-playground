import { Simulation, type Summary } from "@cache-lab/sim-core";
import { describe, expect, it } from "vitest";
import { scenarios } from "../src";

const r3 = (n: number) => Math.round(n * 1000) / 1000;

/** A stable, reviewable digest of a run. If an engine change moves these numbers, the diff shows exactly how. */
function digest(s: Summary) {
  const { windows, lastRemap, remaps, ...totals } = s;
  const rounded = Object.fromEntries(Object.entries(totals).map(([k, v]) => [k, typeof v === "number" ? r3(v) : v]));
  return {
    ...rounded,
    remaps: remaps.map((r) => ({ ...r, remapFraction: r3(r.remapFraction), residentRemapFraction: r3(r.residentRemapFraction) })),
    windowCount: windows.length,
    sampledWindows: windows.filter((_, i) => i % 10 === 0).map((w) => ({ t: w.t, hitRatio: r3(w.hitRatio), p95: r3(w.p95), originQps: r3(w.originQps), maxQueueDepth: w.maxQueueDepth, staleReads: w.staleReads })),
  };
}

describe("golden files", () => {
  for (const s of scenarios) {
    it(`${s.id} matches its golden run`, async () => {
      const sim = new Simulation(s.config);
      sim.runToEnd();
      await expect(JSON.stringify(digest(sim.summary()), null, 2) + "\n").toMatchFileSnapshot(`golden/${s.id}.json`);
    });
  }
});
