import type { SimConfig } from "./engine";

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
    protections: { coalescing: false, ttlJitter: 0, staleWhileRevalidateMs: 0 },
    events: [],
    ...overrides,
  };
}
