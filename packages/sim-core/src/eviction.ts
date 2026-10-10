import { Rng } from "./prng";

export type PolicyName = "fifo" | "lru" | "lfu" | "random" | "tinylfu";

/** Tracks key ordering/frequency and picks eviction victims. The cache owns the data. */
export interface EvictionPolicy {
  onInsert(key: string): void;
  onAccess(key: string): void;
  onRemove(key: string): void;
  /** Key to evict next. Only called when at least one key is tracked. */
  victim(): string;
  /** Called on every lookup (hit or miss). Lets admission-based policies learn frequency. */
  onLookup?(key: string): void;
  /** Whether `candidate` may replace `victim` when the cache is full. */
  admit?(candidate: string, victim: string): boolean;
}

export class FifoPolicy implements EvictionPolicy {
  protected order = new Set<string>();
  onInsert(key: string) {
    this.order.add(key);
  }
  onAccess(_key: string) {}
  onRemove(key: string) {
    this.order.delete(key);
  }
  victim() {
    return this.order.values().next().value as string;
  }
}

export class LruPolicy extends FifoPolicy {
  override onAccess(key: string) {
    if (this.order.delete(key)) this.order.add(key);
  }
}

/** Least-frequently-used; ties broken by least-recently-used. O(n) victim scan, fine at sim scale. */
export class LfuPolicy implements EvictionPolicy {
  private freq = new Map<string, number>();
  onInsert(key: string) {
    this.freq.set(key, 1);
  }
  onAccess(key: string) {
    this.freq.set(key, (this.freq.get(key) ?? 0) + 1);
  }
  onRemove(key: string) {
    this.freq.delete(key);
  }
  victim() {
    let best = "";
    let bestF = Infinity;
    // Map iterates in insertion order; re-inserting on access would break LFU, so ties go to oldest insert.
    for (const [k, f] of this.freq) {
      if (f < bestF) {
        bestF = f;
        best = k;
      }
    }
    return best;
  }
}

export class RandomPolicy implements EvictionPolicy {
  private keys: string[] = [];
  private index = new Map<string, number>();
  constructor(private rng: Rng) {}
  onInsert(key: string) {
    this.index.set(key, this.keys.length);
    this.keys.push(key);
  }
  onAccess(_key: string) {}
  onRemove(key: string) {
    const i = this.index.get(key);
    if (i === undefined) return;
    const last = this.keys.pop()!;
    if (last !== key) {
      this.keys[i] = last;
      this.index.set(last, i);
    }
    this.index.delete(key);
  }
  victim() {
    return this.keys[this.rng.int(this.keys.length)]!;
  }
}

/** Count-min sketch with periodic halving ("aging"). */
class FrequencySketch {
  private rows: Uint8Array[];
  private additions = 0;
  constructor(private width: number, private sampleSize: number) {
    this.rows = Array.from({ length: 4 }, () => new Uint8Array(width));
  }
  private hash(key: string, row: number): number {
    let h = 2166136261 ^ (row * 0x9e3779b1);
    for (let i = 0; i < key.length; i++) h = Math.imul(h ^ key.charCodeAt(i), 16777619);
    return (h >>> 0) % this.width;
  }
  increment(key: string) {
    for (let r = 0; r < 4; r++) {
      const i = this.hash(key, r);
      if (this.rows[r]![i]! < 255) this.rows[r]![i]!++;
    }
    if (++this.additions >= this.sampleSize) this.age();
  }
  estimate(key: string): number {
    let m = 255;
    for (let r = 0; r < 4; r++) m = Math.min(m, this.rows[r]![this.hash(key, r)]!);
    return m;
  }
  private age() {
    for (const row of this.rows) for (let i = 0; i < row.length; i++) row[i] = row[i]! >> 1;
    this.additions = Math.floor(this.additions / 2);
  }
}

/** TinyLFU admission in front of LRU: a newcomer only displaces the LRU victim if it is seen more often. */
export class TinyLfuPolicy extends LruPolicy {
  private sketch: FrequencySketch;
  constructor(capacity: number) {
    super();
    this.sketch = new FrequencySketch(Math.max(64, capacity * 8), Math.max(100, capacity * 10));
  }
  onLookup(key: string) {
    this.sketch.increment(key);
  }
  admit(candidate: string, victim: string) {
    return this.sketch.estimate(candidate) > this.sketch.estimate(victim);
  }
}

export function createPolicy(name: PolicyName, capacity: number, rng: Rng): EvictionPolicy {
  switch (name) {
    case "fifo":
      return new FifoPolicy();
    case "lru":
      return new LruPolicy();
    case "lfu":
      return new LfuPolicy();
    case "random":
      return new RandomPolicy(rng);
    case "tinylfu":
      return new TinyLfuPolicy(capacity);
  }
}
