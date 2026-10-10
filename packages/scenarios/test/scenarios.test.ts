import { Simulation, type SimConfig } from "@cache-lab/sim-core";
import { describe, expect, it } from "vitest";
import { getScenario, scenarios } from "../src";

const run = (cfg: SimConfig) => {
  const sim = new Simulation(cfg);
  sim.runToEnd();
  return sim.summary();
};

type Fix = (c: SimConfig) => SimConfig;
const cache = (c: SimConfig, p: Partial<SimConfig["cache"]>): SimConfig => ({ ...c, cache: { ...c.cache, ...p } });
const prot = (c: SimConfig, p: Partial<SimConfig["protections"]>): SimConfig => ({ ...c, protections: { ...c.protections, ...p } });

/** Config tweaks that should solve each scenario's challenge. */
const solutions: Record<string, Fix[]> = {
  "latency-ladder": [(c) => cache(c, { capacity: 250 })],
  strategies: [(c) => ({ ...c, strategy: "write-through" }), (c) => ({ ...c, strategy: "cache-aside" })],
  "scan-resistance": [(c) => cache(c, { policy: "tinylfu" }), (c) => cache(c, { policy: "lfu" })],
  "stale-reads": [(c) => ({ ...c, strategy: "write-through" })],
  "layers-deploy": [(c) => ({ ...c, invalidation: { ...c.invalidation, versionedKeys: true } })],
  stampede: [(c) => prot(c, { coalescing: true }), (c) => prot(c, { lease: true })],
  penetration: [(c) => prot(c, { negativeCacheTtlMs: 10_000 }), (c) => prot(c, { bloomBitsPerKey: 12 })],
  "cluster-resize": [(c) => ({ ...c, cluster: { ...c.cluster, router: "consistent", vnodes: 100 } })],
  capstone: [(c) => prot(cache(c, { capacity: 300, policy: "tinylfu" }), { coalescing: true })],
};

/** Plausible-but-wrong tweaks that must NOT pass. */
const wrongFixes: Record<string, Fix[]> = {
  "layers-deploy": [
    (c) => ({ ...c, events: [...c.events, { atMs: 20_001, action: { kind: "purgeShared" } }] }),
    (c) => ({ ...c, layers: c.layers.map((l) => ({ ...l, ttlMs: 0 })) }),
  ],
  strategies: [(c) => ({ ...c, strategy: "write-behind", writeBehindFlushMs: 500 })],
};

describe("scenarios", () => {
  it("have unique ids and a focus list", () => {
    expect(new Set(scenarios.map((s) => s.id)).size).toBe(scenarios.length);
    for (const s of scenarios) expect(s.focus.length).toBeGreaterThan(0);
  });
  it("cover every article 1-8", () => {
    expect(new Set(scenarios.map((s) => s.article))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7, 8]));
  });

  for (const s of scenarios) {
    describe(s.id, () => {
      it("starts out failing its challenge", () => {
        expect(s.challenge.check(run(s.config), s.config).pass).toBe(false);
      });
      (solutions[s.id] ?? []).forEach((fix, i) =>
        it(`is solvable (solution ${i + 1})`, () => {
          const cfg = fix(s.config);
          const r = s.challenge.check(run(cfg), cfg);
          expect(r.pass, r.detail).toBe(true);
        }),
      );
      (wrongFixes[s.id] ?? []).forEach((fix, i) =>
        it(`rejects a wrong fix (${i + 1})`, () => {
          const cfg = fix(s.config);
          const r = s.challenge.check(run(cfg), cfg);
          expect(r.pass, r.detail).toBe(false);
        }),
      );
      it("is deterministic", () => {
        expect(run(s.config)).toEqual(run(s.config));
      });
    });
  }

  it("every scenario has at least one solution", () => {
    for (const s of scenarios) expect(solutions[s.id]?.length, s.id).toBeGreaterThan(0);
  });
  it("lookup by id", () => {
    expect(getScenario("stampede")?.article).toBe(6);
  });
});
