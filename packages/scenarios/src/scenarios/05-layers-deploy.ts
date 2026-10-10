import { defaultConfig } from "@cache-lab/sim-core";
import { pct } from "../helpers";
import type { Scenario } from "../types";

export const layersDeploy: Scenario = {
  id: "layers-deploy",
  article: 5,
  title: "Multi-layer request path",
  description: "Browser, CDN and app cache sit in front of the database. At t=20s a deploy changes every page.",
  config: defaultConfig({
    durationMs: 60_000,
    workload: { keyspace: 100, clients: 20, ratePerSec: 300, readRatio: 1, segments: [{ fromMs: 0, pattern: { kind: "zipf", skew: 1 } }] },
    layers: [
      { name: "browser", shared: false, capacity: 30, policy: "lru", ttlMs: 60_000, latencyMs: 0.5, purgeOnWrite: false },
      { name: "cdn", shared: true, capacity: 100, policy: "lru", ttlMs: 60_000, latencyMs: 10, purgeOnWrite: true },
    ],
    cache: { capacity: 200, policy: "lru", ttlMs: 60_000, latencyMs: 2 },
    events: [{ atMs: 20_000, action: { kind: "deploy" } }],
  }),
  challenge: {
    goal: "Make the deploy visible to everyone right away (stale reads under 1%) while browsers and the CDN still answer at least 30% of reads.",
    hints: ["Purging the CDN does nothing for copies already sitting in browsers.", "Turning TTLs to zero fixes staleness but throws caching away. What if a new version had a new cache key?"],
    check: (s) => {
      const reads = s.reads || 1;
      const staleRate = s.staleReads / reads;
      const edge = ((s.hitsByTier.browser ?? 0) + (s.hitsByTier.cdn ?? 0)) / reads;
      return {
        pass: staleRate < 0.01 && edge >= 0.3 && s.now >= 50_000,
        detail: `stale = ${pct(staleRate)} (need < 1%), browser+CDN answered ${pct(edge)} (need ≥ 30%)${s.now < 50_000 ? " — run past t=50s" : ""}`,
      };
    },
  },
};
