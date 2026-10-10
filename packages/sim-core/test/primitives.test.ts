import { describe, expect, it } from "vitest";
import { Histogram } from "../src/histogram";
import { MinHeap } from "../src/heap";
import { Rng } from "../src/prng";
import { Scheduler } from "../src/scheduler";

describe("Rng", () => {
  it("is deterministic per seed", () => {
    const a = new Rng(42);
    const b = new Rng(42);
    expect(Array.from({ length: 5 }, () => a.next())).toEqual(Array.from({ length: 5 }, () => b.next()));
  });
  it("differs across seeds and stays in [0,1)", () => {
    const a = new Rng(1);
    const b = new Rng(2);
    expect(a.next()).not.toBe(b.next());
    for (let i = 0; i < 1000; i++) {
      const x = a.next();
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThan(1);
    }
  });
});

describe("MinHeap", () => {
  it("pops in sorted order", () => {
    const h = new MinHeap<number>((a, b) => a < b);
    [5, 3, 8, 1, 9, 2, 7].forEach((n) => h.push(n));
    const out: number[] = [];
    while (h.size) out.push(h.pop()!);
    expect(out).toEqual([1, 2, 3, 5, 7, 8, 9]);
  });
});

describe("Scheduler", () => {
  it("runs events in time order, FIFO on ties, and advances the clock", () => {
    const s = new Scheduler();
    const log: string[] = [];
    s.schedule(10, () => log.push("b"));
    s.schedule(5, () => log.push("a"));
    s.schedule(10, () => log.push("c"));
    s.runUntil(100);
    expect(log).toEqual(["a", "b", "c"]);
    expect(s.now).toBe(100);
  });
  it("step runs one event", () => {
    const s = new Scheduler();
    let n = 0;
    s.schedule(1, () => n++);
    s.schedule(2, () => n++);
    expect(s.step()).toBe(true);
    expect(n).toBe(1);
    expect(s.now).toBe(1);
  });
});

describe("Histogram", () => {
  it("approximates quantiles", () => {
    const h = new Histogram();
    for (let i = 1; i <= 100; i++) h.add(i);
    expect(h.quantile(0.5)).toBeGreaterThan(48);
    expect(h.quantile(0.5)).toBeLessThan(53);
    expect(h.quantile(0.99)).toBeGreaterThan(96);
    expect(h.mean()).toBeCloseTo(50.5);
  });
});
