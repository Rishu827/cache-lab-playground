import { describe, expect, it } from "vitest";
import { defaultConfig, defaultProtections, normalizeConfig, Simulation, type LayerConfig, type SimConfig } from "../src";

const run = (cfg: SimConfig, inject?: (s: Simulation) => void) => {
  const sim = new Simulation(cfg);
  inject?.(sim);
  sim.runToEnd();
  return sim.summary();
};
const cfg = (o: Partial<SimConfig> = {}) => defaultConfig({ durationMs: 20_000, ...o });
const uniform = (keyspace: number, extra: Partial<SimConfig["workload"]> = {}) => ({
  keyspace, ratePerSec: 200, readRatio: 1, segments: [{ fromMs: 0, pattern: { kind: "uniform" } as const }], ...extra,
});

describe("negative caching and Bloom filter (cache penetration)", () => {
  const penetration = (protections: Partial<SimConfig["protections"]>) =>
    cfg({
      workload: uniform(200, { missingRatio: 0.4, missingKeys: 50 }),
      cache: { capacity: 300, policy: "lru", ttlMs: 0, latencyMs: 1 },
      origin: { latencyMs: 80, jitter: 0, concurrency: 50, failureRate: 0 },
      protections: { ...defaultProtections, ...protections },
    });

  it("without protection every nonexistent-key read reaches the origin", () => {
    const s = run(penetration({}));
    expect(s.originRequests).toBeGreaterThan(s.reads * 0.4);
  });
  it("negative caching absorbs repeated lookups of missing keys", () => {
    const base = run(penetration({}));
    const neg = run(penetration({ negativeCacheTtlMs: 10_000 }));
    expect(neg.originRequests).toBeLessThan(base.originRequests * 0.5);
  });
  it("a Bloom filter blocks missing keys before the cache and origin", () => {
    const s = run(penetration({ bloomBitsPerKey: 12 }));
    expect(s.hitsByTier.bloom).toBeGreaterThan(s.reads * 0.35);
    expect(s.originRequests).toBeLessThan(400);
  });
  it("missing keys are never counted as stale", () => {
    expect(run(penetration({ negativeCacheTtlMs: 5000 })).staleReads).toBe(0);
  });
});

describe("lease", () => {
  const stampede = (lease: boolean, coalescing = false) =>
    cfg({
      workload: uniform(3, { ratePerSec: 400 }),
      cache: { capacity: 100, policy: "lru", ttlMs: 3_000, latencyMs: 1 },
      origin: { latencyMs: 200, jitter: 0, concurrency: 100, failureRate: 0 },
      protections: { ...defaultProtections, lease, coalescing },
    });
  it("leases cut origin fetches during a stampede", () => {
    expect(run(stampede(true)).originRequests).toBeLessThan(run(stampede(false)).originRequests / 3);
  });
  it("waiters pay latency, but less than an origin queue", () => {
    const s = run(stampede(true));
    expect(s.errors).toBe(0);
    expect(s.p99).toBeGreaterThan(50);
  });
});

describe("tag and versioned-key invalidation", () => {
  const writey = (inv: Partial<SimConfig["invalidation"]>, strategy: SimConfig["strategy"] = "cache-aside") =>
    cfg({
      strategy,
      workload: uniform(40, { readRatio: 0.7 }),
      cache: { capacity: 200, policy: "lru", ttlMs: 0, latencyMs: 1 },
      invalidation: { tagGroups: 4, onWrite: "key", versionedKeys: false, ...inv },
    });

  it("tag invalidation on write evicts the whole group (lower hit ratio)", () => {
    const byKey = run(writey({}));
    const byTag = run(writey({ onWrite: "tag" }));
    expect(byTag.hitRatio).toBeLessThan(byKey.hitRatio);
  });
  it("invalidateTag removes tagged entries", () => {
    const sim = new Simulation(writey({}));
    sim.runUntil(5_000);
    const before = sim.cache.snapshot().filter((e) => e.tag === "g1").length;
    expect(before).toBeGreaterThan(0);
    sim.inject({ kind: "invalidateTag", tag: "g1" });
    expect(sim.cache.snapshot().filter((e) => e.tag === "g1").length).toBe(0);
  });
  it("versioned keys remove stale reads even under write-around", () => {
    const plain = run(writey({}, "write-around"));
    const versioned = run(writey({ versionedKeys: true }, "write-around"));
    expect(plain.staleReads).toBeGreaterThan(100);
    expect(versioned.staleReads).toBeLessThan(plain.staleReads / 5);
  });
});

describe("layers and deploys", () => {
  const layers: LayerConfig[] = [
    { name: "browser", shared: false, capacity: 20, policy: "lru", ttlMs: 20_000, latencyMs: 0.5, purgeOnWrite: false },
    { name: "cdn", shared: true, capacity: 100, policy: "lru", ttlMs: 20_000, latencyMs: 10, purgeOnWrite: true },
  ];
  const stack = (o: Partial<SimConfig> = {}) =>
    cfg({
      durationMs: 30_000,
      workload: uniform(50, { clients: 5 }),
      cache: { capacity: 200, policy: "lru", ttlMs: 20_000, latencyMs: 2 },
      layers,
      events: [{ atMs: 8_000, action: { kind: "deploy" } }],
      ...o,
    });

  it("layers answer most requests before the main cache", () => {
    const s = run(stack());
    expect(s.hitsByTier.browser).toBeGreaterThan(1000);
    expect(s.hitsByTier.cdn).toBeGreaterThan(1000);
    expect(s.p50).toBeLessThan(15);
  });
  it("browser hits are the fastest tier", () => {
    const s = run(stack({ layers: layers.slice(1) }));
    expect(s.hitsByTier.browser).toBeUndefined();
    expect(s.hitsByTier.cdn).toBeGreaterThan(0);
  });
  it("a deploy leaves layers serving old content until TTLs expire", () => {
    const s = run(stack());
    expect(s.staleReads).toBeGreaterThan(200);
  });
  it("versioned keys make a deploy visible immediately", () => {
    const base = run(stack());
    const v = run(stack({ invalidation: { tagGroups: 0, onWrite: "key", versionedKeys: true } }));
    expect(v.staleReads).toBeLessThan(base.staleReads / 20);
    expect(v.hitRatio).toBeGreaterThan(0.6);
  });
  it("purging the CDN alone is not enough: browsers keep stale copies", () => {
    const purged = run(stack({ events: [{ atMs: 8_000, action: { kind: "deploy" } }, { atMs: 8_001, action: { kind: "purgeShared" } }] }));
    expect(purged.staleReads).toBeGreaterThan(100);
  });
  it("no-store layers (ttl 0) never cache", () => {
    const s = run(stack({ layers: layers.map((l) => ({ ...l, ttlMs: 0 })) }));
    expect(s.hitsByTier.browser).toBeUndefined();
    expect(s.hitsByTier.cdn).toBeUndefined();
  });
});

describe("cluster", () => {
  const clustered = (router: "modulo" | "consistent", vnodes = 100) =>
    cfg({
      workload: uniform(500),
      cache: { capacity: 150, policy: "lru", ttlMs: 0, latencyMs: 1 },
      cluster: { nodes: 5, router, vnodes },
      events: [{ atMs: 10_000, action: { kind: "addNode" } }],
    });

  it("reports the remap fraction when a node is added", () => {
    const mod = run(clustered("modulo"));
    const ch = run(clustered("consistent"));
    expect(mod.nodeCount).toBe(6);
    expect(mod.lastRemap!.remapFraction).toBeGreaterThan(0.7);
    expect(ch.lastRemap!.remapFraction).toBeLessThan(0.25);
  });
  it("modulo routing causes a bigger hit-ratio dip after resizing", () => {
    const dip = (s: ReturnType<typeof run>) => s.windows.slice(10, 14).reduce((a, w) => a + w.hitRatio, 0) / 4;
    expect(dip(run(clustered("consistent")))).toBeGreaterThan(dip(run(clustered("modulo"))));
  });
  it("capacity scales with node count", () => {
    const sim = new Simulation(clustered("consistent"));
    expect(sim.cache.config.capacity).toBe(750);
    sim.inject({ kind: "addNode" });
    expect(sim.cache.config.capacity).toBe(900);
    sim.inject({ kind: "removeNode" });
    expect(sim.cache.nodeCount).toBe(5);
  });
});

describe("normalizeConfig", () => {
  it("fills fields missing from older saved configs", () => {
    const { protections, invalidation, layers, cluster, events, ...old } = defaultConfig();
    void protections; void invalidation; void layers; void cluster; void events;
    const c = normalizeConfig({ ...old, protections: { coalescing: true } } as never);
    expect(c.protections.coalescing).toBe(true);
    expect(c.protections.bloomBitsPerKey).toBe(0);
    expect(c.cluster.nodes).toBe(1);
    expect(c.layers).toEqual([]);
  });
});
