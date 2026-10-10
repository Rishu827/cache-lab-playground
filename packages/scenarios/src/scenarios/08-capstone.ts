import { defaultConfig } from "@cache-lab/sim-core";
import { ms } from "../helpers";
import type { Scenario } from "../types";

const BUDGET = { p95: 150, originQps: 200, cost: 300 };
/** Cost model: one unit per 1 cache entry. */
const cost = (capacity: number) => capacity;

export const capstone: Scenario = {
  id: "capstone",
  article: 8,
  title: "Capstone sandbox",
  description: "A mixed workload with a traffic spike. Hit a latency and origin-load budget at a given cost.",
  config: defaultConfig({
    durationMs: 90_000,
    workload: {
      keyspace: 1000,
      ratePerSec: 300,
      readRatio: 0.95,
      segments: [
        { fromMs: 0, pattern: { kind: "zipf", skew: 1.1 } },
        { fromMs: 40_000, pattern: { kind: "zipf", skew: 1.1 }, ratePerSec: 600 },
        { fromMs: 60_000, pattern: { kind: "zipf", skew: 1.1 }, ratePerSec: 300 },
      ],
    },
    cache: { capacity: 30, policy: "lru", ttlMs: 60_000, latencyMs: 1 },
    origin: { latencyMs: 100, jitter: 0.3, concurrency: 20, failureRate: 0 },
  }),
  challenge: {
    goal: `p95 < ${BUDGET.p95}ms, peak origin load < ${BUDGET.originQps} QPS, cache cost ≤ ${BUDGET.cost} entries.`,
    hints: ["Cost is just cache capacity here: spend it where the hit ratio gain is largest.", "Policy and protections are free; capacity is not."],
    check: (s, c) => {
      const ok = s.p95 < BUDGET.p95 && s.peakOriginQps < BUDGET.originQps && cost(c.cache.capacity) <= BUDGET.cost && s.now >= 60_000;
      return { pass: ok, detail: `p95 = ${ms(s.p95)}, peak origin = ${s.peakOriginQps.toFixed(0)} QPS, cost = ${cost(c.cache.capacity)}${s.now < 60_000 ? " — run past t=60s" : ""}` };
    },
  },
};
