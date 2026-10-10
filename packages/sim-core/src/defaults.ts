import type { Invalidation, LayerConfig, Protections, SimConfig } from "./engine";
import type { ClusterConfig } from "./cluster";

export const defaultProtections: Protections = {
  coalescing: false,
  ttlJitter: 0,
  staleWhileRevalidateMs: 0,
  negativeCacheTtlMs: 0,
  bloomBitsPerKey: 0,
  lease: false,
  leaseRetryMs: 25,
};
export const defaultInvalidation: Invalidation = { tagGroups: 0, onWrite: "key", versionedKeys: false };
export const defaultCluster: ClusterConfig = { nodes: 1, router: "consistent", vnodes: 100 };

type Loose<T> = { [K in keyof T]?: T[K] extends object ? Loose<T[K]> : T[K] };

/** A sensible baseline config; scenarios override pieces of it. */
export function defaultConfig(overrides: Partial<SimConfig> = {}): SimConfig {
  return {
    seed: 1,
    durationMs: 60_000,
    windowMs: 1_000,
    workload: {
      keyspace: 1000,
      ratePerSec: 200,
      readRatio: 0.95,
      segments: [{ fromMs: 0, pattern: { kind: "zipf", skew: 1 } }],
    },
    cache: { capacity: 100, policy: "lru", ttlMs: 30_000, latencyMs: 1 },
    strategy: "cache-aside",
    writeBehindFlushMs: 2_000,
    origin: { latencyMs: 80, jitter: 0.3, concurrency: 10, failureRate: 0 },
    protections: { ...defaultProtections },
    invalidation: { ...defaultInvalidation },
    layers: [],
    cluster: { ...defaultCluster },
    events: [],
    ...overrides,
  };
}

/** Fill in fields added after a config was saved (e.g. an old share link) so it still runs. */
export function normalizeConfig(c: Loose<SimConfig> & Pick<SimConfig, "workload" | "cache" | "origin">): SimConfig {
  const base = defaultConfig();
  return {
    ...base,
    ...(c as Partial<SimConfig>),
    protections: { ...defaultProtections, ...c.protections },
    invalidation: { ...defaultInvalidation, ...c.invalidation },
    cluster: { ...defaultCluster, ...c.cluster },
    layers: (c.layers as LayerConfig[] | undefined) ?? [],
    events: (c.events as SimConfig["events"] | undefined) ?? [],
  };
}
