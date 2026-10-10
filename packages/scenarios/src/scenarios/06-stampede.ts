import { defaultConfig } from "@cache-lab/sim-core";
import type { Scenario } from "../types";

const QUEUE_LIMIT = 10;

export const stampede: Scenario = {
  id: "stampede",
  article: 6,
  title: "Hot key expiry spike",
  description: "Heavy read traffic on a handful of hot keys, a modest database, and a TTL that expires them in lockstep.",
  config: defaultConfig({
    durationMs: 60_000,
    workload: { keyspace: 1000, ratePerSec: 500, readRatio: 1, segments: [{ fromMs: 0, pattern: { kind: "hotkey", hotFraction: 0.97, hotKeys: 3 } }] },
    cache: { capacity: 200, policy: "lru", ttlMs: 10_000, latencyMs: 1 },
    origin: { latencyMs: 300, jitter: 0.2, concurrency: 24, failureRate: 0 },
    events: [{ atMs: 20_000, action: { kind: "flushCache" } }],
  }),
  focus: ["coalescing", "lease", "jitter", "swr"],
  challenge: {
    goal: `Keep origin queue depth at or below ${QUEUE_LIMIT} through the cache flush at t=20s.`,
    hints: ["Many requests miss the same key at once. Why fetch it more than once?", "Jittering TTLs spreads later expiries out; serving stale data hides refresh time."],
    check: (s) => ({ pass: s.maxQueueDepth <= QUEUE_LIMIT && s.now >= 30_000, detail: `max queue depth = ${s.maxQueueDepth} (limit ${QUEUE_LIMIT})${s.now < 30_000 ? " — run past t=30s" : ""}` }),
  },
};
