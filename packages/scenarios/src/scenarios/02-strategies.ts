import { defaultConfig } from "@cache-lab/sim-core";
import { pct } from "../helpers";
import type { Scenario } from "../types";

export const strategies: Scenario = {
  id: "strategies",
  article: 2,
  title: "Same workload under 5 strategies",
  description: "A write-heavy workload with a cache crash at t=30s. Switch strategies and compare what survives.",
  config: defaultConfig({
    durationMs: 60_000,
    strategy: "write-behind",
    workload: { keyspace: 200, ratePerSec: 200, readRatio: 0.6, segments: [{ fromMs: 0, pattern: { kind: "zipf", skew: 1 } }] },
    cache: { capacity: 100, policy: "lru", ttlMs: 0, latencyMs: 1 },
    events: [{ atMs: 30_000, action: { kind: "crashWriteBehind" } }],
  }),
  challenge: {
    goal: "Survive the crash with zero lost writes, while keeping hit ratio above 40%.",
    hints: ["Write-behind acknowledges before the database has the data.", "Which strategies make the database the first stop for a write?"],
    check: (s) => ({ pass: s.lostWrites === 0 && s.hitRatio > 0.4, detail: `lost writes = ${s.lostWrites} (need 0), hit ratio = ${pct(s.hitRatio)} (need > 40%)` }),
  },
};
