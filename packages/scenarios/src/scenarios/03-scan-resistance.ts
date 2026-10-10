import { defaultConfig } from "@cache-lab/sim-core";
import { minWindowHitRatio, pct } from "../helpers";
import type { Scenario } from "../types";

const SCAN = { from: 20_000, to: 40_000 };
const HOT = { kind: "zipf", skew: 1.5 } as const;
const TARGET = 0.47;

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
  }),
  challenge: {
    goal: "Keep every 1s window's hit ratio above 47% during the scan. Half of the scan-period traffic is one-time keys, so ~50% is the ceiling.",
    hints: ["A scan touches each key once. Which policies let one-hit wonders push out hot keys?", "Policies that track frequency can refuse to admit a key they have barely seen."],
    check: (s) => {
      const min = minWindowHitRatio(s, SCAN.from + 2_000, SCAN.to);
      if (min === undefined) return { pass: false, detail: "Run past t=22s to evaluate the scan window." };
      return { pass: min > TARGET && s.now >= SCAN.to, detail: `worst scan-window hit ratio = ${pct(min)} (need > 47%)` };
    },
  },
};
