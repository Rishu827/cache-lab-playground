import { Simulation, type SimConfig } from "@cache-lab/sim-core";
import { describe, expect, it } from "vitest";
import { getScenario, scenarios } from "../src";

const run = (cfg: SimConfig) => {
  const sim = new Simulation(cfg);
  sim.runToEnd();
  return sim.summary();
};

/** A config tweak that should solve each scenario's challenge. */
const solutions: Record<string, (c: SimConfig) => SimConfig> = {
  "latency-ladder": (c) => ({ ...c, cache: { ...c.cache, capacity: 250 } }),
  strategies: (c) => ({ ...c, strategy: "write-through" }),
  "scan-resistance": (c) => ({ ...c, cache: { ...c.cache, policy: "tinylfu" } }),
  "stale-reads": (c) => ({ ...c, strategy: "write-through" }),
  stampede: (c) => ({ ...c, protections: { ...c.protections, coalescing: true } }),
  capstone: (c) => ({ ...c, cache: { ...c.cache, capacity: 300, policy: "tinylfu" }, protections: { ...c.protections, coalescing: true } }),
};

describe("scenarios", () => {
  it("have unique ids", () => {
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
  });

  for (const s of scenarios) {
    describe(s.id, () => {
      it("starts out failing its challenge", () => {
        expect(s.challenge.check(run(s.config), s.config).pass).toBe(false);
      });
      it("is solvable", () => {
        const cfg = solutions[s.id]!(s.config);
        const r = s.challenge.check(run(cfg), cfg);
        expect(r.detail).toBeTruthy();
        expect(r.pass, r.detail).toBe(true);
      });
      it("is deterministic", () => {
        expect(run(s.config)).toEqual(run(s.config));
      });
    });
  }

  it("lookup by id", () => {
    expect(getScenario("stampede")?.article).toBe(6);
  });
});
