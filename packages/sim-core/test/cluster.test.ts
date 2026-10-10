import { describe, expect, it } from "vitest";
import { CacheCluster, type ClusterConfig } from "../src/cluster";
import { Rng } from "../src/prng";

const keys = Array.from({ length: 2000 }, (_, i) => `k${i}`);
const make = (c: Partial<ClusterConfig>, capacity = 100) =>
  new CacheCluster({ capacity, policy: "lru" }, { nodes: 5, router: "consistent", vnodes: 100, ...c }, new Rng(1), keys);

describe("CacheCluster", () => {
  it("one node behaves like a plain cache", () => {
    const c = make({ nodes: 1 });
    c.set("a", 1, 0, 0);
    expect(c.get("a", 1)?.entry.version).toBe(1);
    expect(c.size).toBe(1);
    expect(c.removeNode()).toBeNull();
  });

  it("routes a key to the same node every time and spreads load", () => {
    const c = make({});
    for (const k of keys.slice(0, 500)) c.set(k, 1, 0, 0);
    expect(c.get("k7", 1)).toBeDefined();
    for (const s of c.nodeStats()) expect(s.size).toBeGreaterThan(50);
  });

  it("modulo routing remaps most keys when a node is added", () => {
    const r = make({ router: "modulo" }).addNode();
    expect(r.remapFraction).toBeGreaterThan(0.7);
  });

  it("consistent hashing with vnodes remaps ~1/(N+1) of keys", () => {
    const r = make({ router: "consistent", vnodes: 100 }).addNode();
    expect(r.remapFraction).toBeGreaterThan(0.08);
    expect(r.remapFraction).toBeLessThan(0.25);
  });

  it("more vnodes give a more even split than one vnode", () => {
    const spread = (v: number) => {
      const c = make({ vnodes: v }, 5000);
      for (const k of keys) c.set(k, 1, 0, 0);
      const sizes = c.nodeStats().map((s) => s.size);
      return Math.max(...sizes) - Math.min(...sizes);
    };
    expect(spread(200)).toBeLessThan(spread(1));
  });

  it("removing a node drops its entries and keeps total capacity consistent", () => {
    const c = make({});
    for (const k of keys.slice(0, 400)) c.set(k, 1, 0, 0);
    const before = c.size;
    const r = c.removeNode()!;
    expect(c.nodeCount).toBe(4);
    expect(c.size).toBeLessThan(before);
    expect(r.remapFraction).toBeGreaterThan(0.1);
    expect(c.config.capacity).toBe(400);
  });

  it("deleteByTag removes tagged entries across nodes", () => {
    const c = make({});
    for (let i = 0; i < 50; i++) c.set(`k${i}`, 1, 0, 0, false, i % 2 ? "odd" : "even");
    expect(c.deleteByTag("odd")).toBe(25);
    expect(c.size).toBe(25);
  });
});
