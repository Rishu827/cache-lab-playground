import { defaultConfig } from "@cache-lab/sim-core";
import { ms } from "../helpers";
import type { Scenario } from "../types";

const MAX_CAPACITY = 250;

export const latencyLadder: Scenario = {
  id: "latency-ladder",
  article: 1,
  title: "Latency ladder and hit-ratio explorer",
  description: "A Zipf workload against a slow database. See how cache size moves hit ratio and tail latency.",
  config: defaultConfig({
    durationMs: 60_000,
    workload: { keyspace: 300, ratePerSec: 200, readRatio: 1, segments: [{ fromMs: 0, pattern: { kind: "zipf", skew: 1.2 } }] },
    cache: { capacity: 10, policy: "lru", ttlMs: 0, latencyMs: 1 },
    origin: { latencyMs: 100, jitter: 0.3, concurrency: 20, failureRate: 0 },
  }),
  focus: ["capacity", "policy"],
  challenge: {
    goal: `Reach p95 < 50 ms with a cache of at most ${MAX_CAPACITY} entries.`,
    hints: ["p95 is a miss-dominated number: it drops once hit ratio passes ~95%.", "Zipf traffic is skewed, so the first entries are worth far more than the last."],
    check: (s, c) => {
      const ok = s.p95 < 50 && c.cache.capacity <= MAX_CAPACITY;
      return { pass: ok, detail: `p95 = ${ms(s.p95)} (need < 50ms), capacity = ${c.cache.capacity} (max ${MAX_CAPACITY})` };
    },
  },
};
