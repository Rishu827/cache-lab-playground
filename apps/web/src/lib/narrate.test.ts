import { defaultConfig, Simulation } from "@cache-lab/sim-core";
import { describe, expect, it } from "vitest";
import { narrate } from "./narrate";

describe("narrate", () => {
  it("prompts before the run starts", () => {
    const s = new Simulation(defaultConfig()).summary();
    expect(narrate(s).lines[0]).toMatch(/Press Play/);
  });
  it("describes hit ratio and latency, and flags an overloaded origin", () => {
    const sim = new Simulation(defaultConfig({ durationMs: 10_000, cache: { capacity: 0, policy: "lru", ttlMs: 0, latencyMs: 1 }, origin: { latencyMs: 200, jitter: 0, concurrency: 2, failureRate: 0 } }));
    sim.runUntil(8_000);
    const n = narrate(sim.summary());
    expect(n.lines[0]).toMatch(/0 were answered by the cache/);
    expect(n.warnings.join(" ")).toMatch(/overloaded/);
  });
  it("calls out stale reads", () => {
    const sim = new Simulation(defaultConfig({ durationMs: 20_000, strategy: "write-around", cache: { capacity: 100, policy: "lru", ttlMs: 0, latencyMs: 1 }, workload: { keyspace: 10, ratePerSec: 200, readRatio: 0.7, segments: [{ fromMs: 0, pattern: { kind: "uniform" } }] } }));
    sim.runToEnd();
    expect(narrate(sim.summary()).warnings.join(" ")).toMatch(/out-of-date/);
  });
});
