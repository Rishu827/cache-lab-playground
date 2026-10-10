import { defaultConfig } from "@cache-lab/sim-core";
import { pct } from "../helpers";
import type { Scenario } from "../types";

export const clusterResize: Scenario = {
  id: "cluster-resize",
  article: 7,
  title: "5-node cluster, add and remove a node",
  description: "Five cache nodes behind a router. A sixth node joins at t=30s and one leaves at t=50s.",
  config: defaultConfig({
    durationMs: 70_000,
    workload: { keyspace: 2000, ratePerSec: 400, readRatio: 1, segments: [{ fromMs: 0, pattern: { kind: "zipf", skew: 0.9 } }] },
    cache: { capacity: 200, policy: "lru", ttlMs: 0, latencyMs: 1 },
    origin: { latencyMs: 60, jitter: 0.2, concurrency: 40, failureRate: 0 },
    cluster: { nodes: 5, router: "modulo", vnodes: 1 },
    events: [
      { atMs: 30_000, action: { kind: "addNode" } },
      { atMs: 50_000, action: { kind: "removeNode" } },
    ],
  }),
  focus: ["router", "vnodes", "nodes"],
  challenge: {
    goal: "Cut the share of keys that move when the sixth node joins to under 25%.",
    hints: ["Modulo routing changes N for every key. What mapping only moves keys near the new node?", "With few virtual nodes the ring is lumpy; more vnodes smooth the split."],
    check: (s) => {
      const add = s.remaps.find((r) => r.kind === "add");
      if (!add) return { pass: false, detail: "Run past t=30s, when the node is added." };
      return { pass: add.remapFraction < 0.25, detail: `${pct(add.remapFraction)} of keys moved on node add (need < 25%)` };
    },
  },
};
