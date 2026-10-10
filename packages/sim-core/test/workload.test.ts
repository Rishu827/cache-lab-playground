import { describe, expect, it } from "vitest";
import { Rng } from "../src/prng";
import { parseTrace, WorkloadGenerator, type WorkloadConfig } from "../src/workload";

const gen = (cfg: Partial<WorkloadConfig>, seed = 1) =>
  new WorkloadGenerator({ keyspace: 100, ratePerSec: 100, readRatio: 1, segments: [{ fromMs: 0, pattern: { kind: "uniform" } }], ...cfg }, new Rng(seed));
const take = (g: WorkloadGenerator, n: number) => Array.from({ length: n }, () => g.next());

describe("WorkloadGenerator", () => {
  it("zipf concentrates traffic on low-rank keys", () => {
    const reqs = take(gen({ segments: [{ fromMs: 0, pattern: { kind: "zipf", skew: 1.2 } }] }), 5000);
    const k0 = reqs.filter((r) => r.key === "k0").length;
    const k50 = reqs.filter((r) => r.key === "k50").length;
    expect(k0).toBeGreaterThan(k50 * 10);
  });
  it("scan walks the keyspace in order and wraps", () => {
    const keys = take(gen({ keyspace: 5, segments: [{ fromMs: 0, pattern: { kind: "scan" } }] }), 7).map((r) => r.key);
    expect(keys).toEqual(["k0", "k1", "k2", "k3", "k4", "k0", "k1"]);
  });
  it("respects the read ratio", () => {
    const reqs = take(gen({ readRatio: 0.7 }), 5000);
    const reads = reqs.filter((r) => r.op === "read").length / reqs.length;
    expect(reads).toBeGreaterThan(0.66);
    expect(reads).toBeLessThan(0.74);
  });
  it("assigns clients when configured", () => {
    const clients = new Set(take(gen({ clients: 4 }), 200).map((r) => r.client));
    expect(clients.size).toBe(4);
  });
  it("aims a fraction of reads at nonexistent keys", () => {
    const reqs = take(gen({ missingRatio: 0.25, missingKeys: 10 }), 4000);
    const missing = reqs.filter((r) => r.key.startsWith("x"));
    expect(missing.length / reqs.length).toBeGreaterThan(0.2);
    expect(new Set(missing.map((r) => r.key)).size).toBeLessThanOrEqual(10);
  });
  it("replays a trace with its own ops", () => {
    const g = gen({ segments: [{ fromMs: 0, pattern: { kind: "trace", keys: ["a", "b"], ops: ["r", "w"] } }] });
    const reqs = take(g, 4).map((r) => `${r.op}:${r.key}`);
    expect(reqs).toEqual(["read:a", "write:b", "read:a", "write:b"]);
  });
});

describe("parseTrace", () => {
  it("parses keys, ops, comments and counts unique keys", () => {
    const t = parseTrace("# header\nuser:1\nGET user:2\nPUT user:1\n\nw, user:3\nr user:1");
    expect(t.keys).toEqual(["user:1", "user:2", "user:1", "user:3", "user:1"]);
    expect(t.ops).toEqual(["r", "r", "w", "w", "r"]);
    expect(t.keyspace).toBe(3);
  });
});
