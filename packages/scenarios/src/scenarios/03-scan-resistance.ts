import { defaultConfig } from "@cache-lab/sim-core";
import { hitRatioBetween, pct } from "../helpers";
import type { Scenario } from "../types";

const SCAN = { from: 20_000, to: 40_000 };
const HOT = { kind: "zipf", skew: 1.5 } as const;
const TARGET = 0.45;

export const scanResistance: Scenario = {
  id: "scan-resistance",
  article: 3,
  title: "Zipf workload plus a scan burst",
  description: "Steady skewed traffic, then a sequential scan between t=20s and t=40s (think: a batch job).",
  config: defaultConfig({
    durationMs: 60_000,
    workload: {
      keyspace: 1000,
      ratePerSec: 300,
      readRatio: 1,
      segments: [
        { fromMs: 0, pattern: HOT },
        { fromMs: SCAN.from, pattern: { kind: "mix", parts: [{ weight: 1, pattern: HOT }, { weight: 1, pattern: { kind: "scan" } }] } },
        { fromMs: SCAN.to, pattern: HOT },
      ],
    },
    cache: { capacity: 100, policy: "lru", ttlMs: 0, latencyMs: 1 },
    origin: { latencyMs: 80, jitter: 0.3, concurrency: 40, failureRate: 0 },
  }),
  focus: ["policy", "capacity"],
  challenge: {
    goal: "Keep the hit ratio above 45% while the scan runs (t=20s to 40s). Half of that traffic is one-time keys, so ~50% is the ceiling.",
    hints: ["A scan touches each key once. Which policies let one-hit wonders push out hot keys?", "Policies that track frequency can refuse to admit a key they have barely seen."],
    check: (s) => {
      const ratio = hitRatioBetween(s, SCAN.from + 2_000, SCAN.to);
      if (ratio === undefined) return { pass: false, detail: "Run past t=22s to evaluate the scan window." };
      return { pass: ratio > TARGET && s.now >= SCAN.to, detail: `hit ratio during scan = ${pct(ratio)} (need > 45%)` };
    },
  },
};
