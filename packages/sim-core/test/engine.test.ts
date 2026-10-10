import { describe, expect, it } from "vitest";
import { defaultConfig, defaultProtections, Simulation, type SimConfig } from "../src";

const run = (cfg: SimConfig) => {
  const sim = new Simulation(cfg);
  sim.runToEnd();
  return sim.summary();
};
const cfg = (o: Partial<SimConfig> = {}) => defaultConfig({ durationMs: 20_000, ...o });

describe("determinism", () => {
  it("same config + seed yields identical metrics", () => {
    expect(run(cfg({ seed: 7 }))).toEqual(run(cfg({ seed: 7 })));
  });
  it("different seeds differ", () => {
    expect(run(cfg({ seed: 7 })).hits).not.toBe(run(cfg({ seed: 8 })).hits);
  });
  it("stepping event-by-event equals running to the end", () => {
    const a = new Simulation(cfg());
    while (a.step());
    expect(a.summary()).toEqual(run(cfg()));
  });
});

describe("cache behaviour", () => {
  it("accounts for every read as hit, miss or error", () => {
    const s = run(cfg());
    expect(s.hits + s.misses + s.errors).toBe(s.reads);
  });
  it("a bigger cache raises hit ratio and lowers latency", () => {
    const small = run(cfg({ cache: { ...cfg().cache, capacity: 10 } }));
    const big = run(cfg({ cache: { ...cfg().cache, capacity: 500 } }));
    expect(big.hitRatio).toBeGreaterThan(small.hitRatio);
    expect(big.p95).toBeLessThanOrEqual(small.p95);
  });
  it("hits are served at cache latency", () => {
    const s = run(cfg({ cache: { ...cfg().cache, capacity: 1000, ttlMs: 0 } }));
    expect(s.p50).toBeLessThan(5);
  });
  it("emits windowed samples", () => {
    const s = run(cfg());
    expect(s.windows.length).toBeGreaterThanOrEqual(19);
    expect(s.windows[5]!.reads).toBeGreaterThan(0);
  });
});

describe("strategies and consistency", () => {
  const writey = (strategy: SimConfig["strategy"], extra: Partial<SimConfig> = {}) =>
    cfg({
      strategy,
      workload: { keyspace: 20, ratePerSec: 200, readRatio: 0.7, segments: [{ fromMs: 0, pattern: { kind: "uniform" } }] },
      cache: { capacity: 100, policy: "lru", ttlMs: 0, latencyMs: 1 },
      ...extra,
    });

  it("write-around leaves the cache stale (no TTL)", () => {
    expect(run(writey("write-around")).staleReads).toBeGreaterThan(50);
  });
  it("write-through keeps stale reads rare; cache-aside has a read/write race but beats write-around", () => {
    const wt = run(writey("write-through"));
    const ca = run(writey("cache-aside"));
    const wa = run(writey("write-around"));
    expect(wt.staleReads / wt.reads).toBeLessThan(0.05);
    expect(ca.staleReads).toBeLessThan(wa.staleReads);
  });
  it("write-behind crash loses buffered writes; other strategies lose none", () => {
    const crash = [{ atMs: 10_100, action: { kind: "crashWriteBehind" } as const }];
    expect(run(writey("write-behind", { events: crash })).lostWrites).toBeGreaterThan(0);
    expect(run(writey("write-through", { events: crash })).lostWrites).toBe(0);
  });
  it("write-behind without a crash eventually flushes everything", () => {
    expect(run(writey("write-behind")).lostWrites).toBe(0);
  });
});

describe("protections", () => {
  const stampede = (coalescing: boolean) =>
    cfg({
      workload: { keyspace: 5, ratePerSec: 500, readRatio: 1, segments: [{ fromMs: 0, pattern: { kind: "uniform" } }] },
      cache: { capacity: 100, policy: "lru", ttlMs: 2_000, latencyMs: 1 },
      origin: { latencyMs: 200, jitter: 0, concurrency: 50, failureRate: 0 },
      protections: { ...defaultProtections, coalescing },
    });
  it("request coalescing cuts origin load during a stampede", () => {
    expect(run(stampede(true)).originRequests).toBeLessThan(run(stampede(false)).originRequests / 2);
  });
  it("stale-while-revalidate hides refresh latency", () => {
    const base = stampede(true);
    const swr = { ...base, protections: { ...base.protections, staleWhileRevalidateMs: 1_000 } };
    expect(run(swr).p99).toBeLessThan(run(base).p99);
  });
});

describe("origin overload", () => {
  it("builds a queue when demand exceeds concurrency", () => {
    const s = run(cfg({ cache: { capacity: 0, policy: "lru", ttlMs: 0, latencyMs: 1 }, origin: { latencyMs: 100, jitter: 0, concurrency: 5, failureRate: 0 } }));
    expect(s.maxQueueDepth).toBeGreaterThan(20);
  });
  it("origin outage produces errors", () => {
    const s = run(cfg({ events: [{ atMs: 5_000, action: { kind: "originOutage", durationMs: 3_000 } }] }));
    expect(s.errors).toBeGreaterThan(0);
  });
});

const onCI = Boolean((globalThis as { process?: { env?: Record<string, string> } }).process?.env?.CI);

describe("performance", () => {
  it("simulates ~100k requests in about a second", () => {
    const t = Date.now();
    const s = run(cfg({ durationMs: 100_000, workload: { ...cfg().workload, ratePerSec: 1000 } }));
    expect(s.reads + s.writes).toBeGreaterThan(90_000);
    // ~1s locally; shared CI runners can be several times slower, so allow headroom there.
    expect(Date.now() - t).toBeLessThan(onCI ? 10_000 : 2500);
  });
});

describe("workload mix", () => {
  it("interleaves patterns by weight", () => {
    const zipf = { kind: "zipf", skew: 1.2 } as const;
    const s = run(
      cfg({
        workload: { keyspace: 1000, ratePerSec: 200, readRatio: 1, segments: [{ fromMs: 0, pattern: { kind: "mix", parts: [{ weight: 1, pattern: zipf }, { weight: 1, pattern: { kind: "scan" } }] } }] },
      }),
    );
    expect(s.reads).toBeGreaterThan(3000);
  });
});

describe("advanceTo", () => {
  it("honours the event budget and then reaches the target", () => {
    const sim = new Simulation(cfg());
    expect(sim.advanceTo(10_000, 50)).toBe(false);
    expect(sim.now).toBeLessThan(10_000);
    while (!sim.advanceTo(10_000, 1000));
    expect(sim.now).toBe(10_000);
  });
});
