import { defaultConfig } from "@cache-lab/sim-core";
import { pct } from "../helpers";
import type { Scenario } from "../types";

export const staleReads: Scenario = {
  id: "stale-reads",
  article: 4,
  title: "Read/write race injection",
  description: "A small hot keyspace with 30% writes and a slow database: reads and writes overlap constantly.",
  config: defaultConfig({
    durationMs: 60_000,
    strategy: "write-around",
    workload: { keyspace: 30, ratePerSec: 200, readRatio: 0.7, segments: [{ fromMs: 0, pattern: { kind: "uniform" } }] },
    cache: { capacity: 100, policy: "lru", ttlMs: 30_000, latencyMs: 1 },
    origin: { latencyMs: 80, jitter: 0.4, concurrency: 20, failureRate: 0 },
  }),
  challenge: {
    goal: "Stale reads under 1% of reads, with hit ratio still above 50%.",
    hints: ["Not caching at all is a valid but boring answer. Hit ratio must stay high.", "Which strategies touch the cache when a write happens? Does a shorter TTL help?"],
    check: (s) => {
      const rate = s.reads ? s.staleReads / s.reads : 0;
      return { pass: rate < 0.01 && s.hitRatio > 0.5 && s.reads > 1000, detail: `stale = ${pct(rate)} (need < 1%), hit ratio = ${pct(s.hitRatio)} (need > 50%)` };
    },
  },
};
