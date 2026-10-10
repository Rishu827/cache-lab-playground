import { defaultConfig } from "@cache-lab/sim-core";
import type { Scenario } from "../types";

const QUEUE_LIMIT = 10;
const WARMUP_MS = 10_000;

export const penetration: Scenario = {
  id: "penetration",
  article: 6,
  title: "Cache penetration: lookups for keys that don't exist",
  description: "Half of all requests ask for IDs that are not in the database. A cache can't hold what isn't there, so every one reaches the origin.",
  config: defaultConfig({
    durationMs: 40_000,
    workload: { keyspace: 500, ratePerSec: 300, readRatio: 1, missingRatio: 0.5, missingKeys: 150, segments: [{ fromMs: 0, pattern: { kind: "zipf", skew: 1 } }] },
    cache: { capacity: 300, policy: "lru", ttlMs: 0, latencyMs: 1 },
    origin: { latencyMs: 100, jitter: 0.2, concurrency: 20, failureRate: 0 },
  }),
  challenge: {
    goal: `After a 10s warm-up, keep origin queue depth at or below ${QUEUE_LIMIT}.`,
    hints: ["Remember that \"not found\" is also an answer. Can the cache hold it, briefly?", "A Bloom filter can answer \"definitely not here\" without asking anyone. Trade-off: memory and a small false-positive rate."],
    check: (s) => {
      const peak = Math.max(0, ...s.windows.filter((w) => w.t >= WARMUP_MS).map((w) => w.maxQueueDepth));
      return { pass: peak <= QUEUE_LIMIT && s.now >= 30_000, detail: `max queue depth after warm-up = ${peak} (limit ${QUEUE_LIMIT})${s.now < 30_000 ? " — run past t=30s" : ""}` };
    },
  },
};
