import { describe, expect, it } from "vitest";
import { BloomFilter } from "../src/bloom";
import { hash32 } from "../src/hash";

describe("BloomFilter", () => {
  it("has no false negatives", () => {
    const b = new BloomFilter(1000, 10);
    for (let i = 0; i < 1000; i++) b.add(`k${i}`);
    for (let i = 0; i < 1000; i++) expect(b.mightContain(`k${i}`)).toBe(true);
  });
  it("keeps false positives low at 10 bits/key (~1%)", () => {
    const b = new BloomFilter(1000, 10);
    for (let i = 0; i < 1000; i++) b.add(`k${i}`);
    let fp = 0;
    for (let i = 0; i < 5000; i++) if (b.mightContain(`x${i}`)) fp++;
    expect(fp / 5000).toBeLessThan(0.03);
  });
  it("more bits per key means fewer false positives", () => {
    const fp = (bits: number) => {
      const b = new BloomFilter(1000, bits);
      for (let i = 0; i < 1000; i++) b.add(`k${i}`);
      let n = 0;
      for (let i = 0; i < 5000; i++) if (b.mightContain(`x${i}`)) n++;
      return n;
    };
    expect(fp(4)).toBeGreaterThan(fp(12));
  });
});

describe("hash32", () => {
  it("is deterministic and spreads sequential keys", () => {
    expect(hash32("k1")).toBe(hash32("k1"));
    const buckets = new Array(8).fill(0);
    for (let i = 0; i < 8000; i++) buckets[hash32(`k${i}`) % 8]++;
    for (const n of buckets) expect(n).toBeGreaterThan(800);
  });
});
