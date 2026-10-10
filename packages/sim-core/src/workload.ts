import { Rng } from "./prng";

export type Pattern =
  | { kind: "uniform" }
  | { kind: "zipf"; skew: number }
  /** Sequential scan over the keyspace, wrapping around. */
  | { kind: "scan" }
  /** `hotFraction` of requests hit `hotKeys` keys; the rest are uniform. */
  | { kind: "hotkey"; hotFraction: number; hotKeys: number }
  /** Replay a fixed list of keys in a loop. */
  | { kind: "trace"; keys: string[] }
  /** Interleave several patterns by weight, e.g. a background scan on top of steady skewed traffic. */
  | { kind: "mix"; parts: { weight: number; pattern: Pattern }[] };

/** From `fromMs` onwards, the workload uses these settings (until the next segment). */
export interface WorkloadSegment {
  fromMs: number;
  pattern: Pattern;
  ratePerSec?: number;
  readRatio?: number;
}

export interface WorkloadConfig {
  keyspace: number;
  ratePerSec: number;
  readRatio: number;
  /** Must be sorted by `fromMs`; the first should start at 0. */
  segments: WorkloadSegment[];
}

export interface Request {
  t: number;
  op: "read" | "write";
  key: string;
}

export const keyName = (i: number) => `k${i}`;

/** Inverse-CDF Zipf sampler over ranks 1..n. Rank 1 maps to k0 (the hottest key). */
class ZipfSampler {
  private cdf: Float64Array;
  constructor(n: number, skew: number) {
    this.cdf = new Float64Array(n);
    let sum = 0;
    for (let i = 0; i < n; i++) this.cdf[i] = sum += 1 / Math.pow(i + 1, skew);
    for (let i = 0; i < n; i++) this.cdf[i]! /= sum;
  }
  sample(u: number): number {
    let lo = 0;
    let hi = this.cdf.length - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.cdf[mid]! < u) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }
}

export class WorkloadGenerator {
  private zipf = new Map<number, ZipfSampler>();
  private scanPos = 0;
  private tracePos = 0;
  private t = 0;

  constructor(private cfg: WorkloadConfig, private rng: Rng) {}

  private segmentAt(t: number): WorkloadSegment {
    let seg = this.cfg.segments[0]!;
    for (const s of this.cfg.segments) if (s.fromMs <= t) seg = s;
    return seg;
  }

  private pickKey(p: Pattern): string {
    const n = this.cfg.keyspace;
    switch (p.kind) {
      case "uniform":
        return keyName(this.rng.int(n));
      case "zipf": {
        let s = this.zipf.get(p.skew);
        if (!s) this.zipf.set(p.skew, (s = new ZipfSampler(n, p.skew)));
        return keyName(s.sample(this.rng.next()));
      }
      case "scan":
        return keyName(this.scanPos++ % n);
      case "hotkey":
        return this.rng.next() < p.hotFraction ? keyName(this.rng.int(Math.min(p.hotKeys, n))) : keyName(this.rng.int(n));
      case "trace":
        return p.keys[this.tracePos++ % p.keys.length] ?? keyName(0);
      case "mix": {
        const total = p.parts.reduce((a, x) => a + x.weight, 0);
        let u = this.rng.next() * total;
        for (const part of p.parts) if ((u -= part.weight) < 0) return this.pickKey(part.pattern);
        return this.pickKey(p.parts[p.parts.length - 1]!.pattern);
      }
    }
  }

  /** Generate the next request with Poisson arrivals at the current segment's rate. */
  next(): Request {
    const seg = this.segmentAt(this.t);
    const rate = seg.ratePerSec ?? this.cfg.ratePerSec;
    this.t += this.rng.exp(1000 / Math.max(rate, 0.001));
    const cur = this.segmentAt(this.t);
    const readRatio = cur.readRatio ?? this.cfg.readRatio;
    return { t: this.t, op: this.rng.next() < readRatio ? "read" : "write", key: this.pickKey(cur.pattern) };
  }
}
