import { describe, expect, it } from "vitest";
import { Cache } from "../src/cache";
import type { PolicyName } from "../src/eviction";
import { Rng } from "../src/prng";

const make = (policy: PolicyName, capacity: number) => new Cache({ capacity, policy }, new Rng(1));
const keys = (c: Cache) => c.snapshot().map((e) => e.key).sort();

/** Replay a trace of reads; on a miss, insert. Returns hit count. */
function replay(c: Cache, trace: string[]): number {
  let hits = 0;
  trace.forEach((k, i) => {
    if (c.get(k, i)) hits++;
    else c.set(k, 1, i, 0);
  });
  return hits;
}

describe("FIFO", () => {
  it("evicts the oldest insert regardless of access", () => {
    const c = make("fifo", 2);
    replay(c, ["a", "b", "a", "c"]);
    expect(keys(c)).toEqual(["b", "c"]);
  });
});

describe("LRU", () => {
  it("evicts the least recently used key", () => {
    const c = make("lru", 2);
    replay(c, ["a", "b", "a", "c"]);
    expect(keys(c)).toEqual(["a", "c"]);
  });
  it("is scan-vulnerable: a scan flushes the hot set", () => {
    const c = make("lru", 3);
    replay(c, ["h1", "h2", "h1", "h2", "s1", "s2", "s3"]);
    expect(keys(c)).toEqual(["s1", "s2", "s3"]);
  });
});

describe("LFU", () => {
  it("evicts the least frequently used key", () => {
    const c = make("lfu", 2);
    replay(c, ["a", "a", "a", "b", "c"]);
    expect(keys(c)).toEqual(["a", "c"]);
  });
  it("resists scans: hot keys survive", () => {
    const c = make("lfu", 3);
    replay(c, ["h1", "h2", "h1", "h2", "h1", "h2", "s1", "s2", "s3", "s4"]);
    expect(keys(c)).toContain("h1");
    expect(keys(c)).toContain("h2");
  });
});

describe("Random", () => {
  it("holds capacity and is deterministic per seed", () => {
    const trace = Array.from({ length: 200 }, (_, i) => `k${(i * 7) % 23}`);
    const a = make("random", 5);
    const b = make("random", 5);
    replay(a, trace);
    replay(b, trace);
    expect(a.size).toBe(5);
    expect(keys(a)).toEqual(keys(b));
  });
});

describe("TinyLFU", () => {
  it("rejects one-hit wonders that would displace hot keys", () => {
    const c = make("tinylfu", 3);
    const hot = Array.from({ length: 20 }, (_, i) => (i % 2 ? "h1" : "h2"));
    replay(c, ["h3", ...hot, "h3", "h3"]);
    const before = keys(c);
    replay(c, ["s1", "s2", "s3", "s4", "s5"]);
    expect(keys(c)).toEqual(before);
  });
  it("beats LRU on hot set + scan workloads", () => {
    const trace: string[] = [];
    for (let r = 0; r < 30; r++) {
      for (const h of ["h1", "h2", "h3"]) trace.push(h);
      for (let s = 0; s < 4; s++) trace.push(`s${r * 4 + s}`);
    }
    expect(replay(make("tinylfu", 4), trace)).toBeGreaterThan(replay(make("lru", 4), trace));
  });
});

describe("Cache TTL", () => {
  it("expires entries and counts evictions", () => {
    const c = make("lru", 2);
    c.set("a", 1, 0, 100);
    expect(c.get("a", 50)?.fresh).toBe(true);
    expect(c.get("a", 100)).toBeUndefined();
    c.set("b", 1, 0, 0);
    c.set("c", 1, 0, 0);
    c.set("d", 1, 0, 0);
    expect(c.evictions).toBe(1);
  });
  it("serves stale entries inside the stale window", () => {
    const c = make("lru", 2);
    c.set("a", 1, 0, 100);
    expect(c.get("a", 150, 100)?.fresh).toBe(false);
    expect(c.get("a", 250, 100)).toBeUndefined();
  });
});
