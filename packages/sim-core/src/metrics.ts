import { Histogram } from "./histogram";

export interface WindowSample {
  /** Window start (ms). */
  t: number;
  reads: number;
  hits: number;
  misses: number;
  errors: number;
  staleReads: number;
  writes: number;
  evictions: number;
  originRequests: number;
  originQps: number;
  maxQueueDepth: number;
  fillPct: number;
  avgLatency: number;
  p50: number;
  p95: number;
  p99: number;
  hitRatio: number;
}

export interface Summary {
  now: number;
  reads: number;
  writes: number;
  hits: number;
  misses: number;
  errors: number;
  staleReads: number;
  lostWrites: number;
  evictions: number;
  originRequests: number;
  maxQueueDepth: number;
  peakOriginQps: number;
  fillPct: number;
  hitRatio: number;
  avgLatency: number;
  p50: number;
  p95: number;
  p99: number;
  windows: WindowSample[];
}

interface Acc {
  reads: number;
  hits: number;
  misses: number;
  errors: number;
  staleReads: number;
  writes: number;
  evictions: number;
  originRequests: number;
  maxQueueDepth: number;
  hist: Histogram;
}

const blank = (): Acc => ({
  reads: 0, hits: 0, misses: 0, errors: 0, staleReads: 0, writes: 0, evictions: 0, originRequests: 0, maxQueueDepth: 0, hist: new Histogram(),
});

export interface Gauges {
  fillPct: number;
  evictions: number;
  originRequests: number;
  queueDepth: number;
}

/** Cumulative totals plus per-window samples for charting. */
export class Metrics {
  private total = blank();
  private win = blank();
  private winStart = 0;
  private lastEvictions = 0;
  private lastOriginReqs = 0;
  readonly windows: WindowSample[] = [];
  lostWrites = 0;
  private peakQps = 0;

  constructor(readonly windowMs: number) {}

  private both(f: (a: Acc) => void) {
    f(this.total);
    f(this.win);
  }

  /** Record a completed read. `outcome` is how the cache stack answered it. */
  read(outcome: "hit" | "miss" | "error", latencyMs: number, stale: boolean) {
    this.both((a) => {
      a.reads++;
      if (outcome === "hit") a.hits++;
      else if (outcome === "miss") a.misses++;
      else a.errors++;
      if (stale) a.staleReads++;
      if (outcome !== "error") a.hist.add(latencyMs);
    });
  }
  write(latencyMs: number, error: boolean) {
    this.both((a) => {
      a.writes++;
      if (error) a.errors++;
      else a.hist.add(latencyMs);
    });
  }
  queueDepth(d: number) {
    this.both((a) => (a.maxQueueDepth = Math.max(a.maxQueueDepth, d)));
  }

  /** Close every window that ended at or before `now`. */
  advance(now: number, g: Gauges) {
    while (now >= this.winStart + this.windowMs) this.closeWindow(g);
  }

  private closeWindow(g: Gauges) {
    const w = this.win;
    w.evictions = g.evictions - this.lastEvictions;
    w.originRequests = g.originRequests - this.lastOriginReqs;
    this.lastEvictions = g.evictions;
    this.lastOriginReqs = g.originRequests;
    const qps = (w.originRequests / this.windowMs) * 1000;
    this.peakQps = Math.max(this.peakQps, qps);
    this.windows.push({
      t: this.winStart,
      reads: w.reads, hits: w.hits, misses: w.misses, errors: w.errors, staleReads: w.staleReads, writes: w.writes,
      evictions: w.evictions, originRequests: w.originRequests, originQps: qps, maxQueueDepth: w.maxQueueDepth,
      fillPct: g.fillPct,
      avgLatency: w.hist.mean(), p50: w.hist.quantile(0.5), p95: w.hist.quantile(0.95), p99: w.hist.quantile(0.99),
      hitRatio: w.hits + w.misses > 0 ? w.hits / (w.hits + w.misses) : 0,
    });
    this.win = blank();
    this.winStart += this.windowMs;
  }

  summary(now: number, g: Gauges, maxQueueDepth: number): Summary {
    const t = this.total;
    return {
      now,
      reads: t.reads, writes: t.writes, hits: t.hits, misses: t.misses, errors: t.errors,
      staleReads: t.staleReads, lostWrites: this.lostWrites, evictions: g.evictions,
      originRequests: g.originRequests, maxQueueDepth, peakOriginQps: this.peakQps, fillPct: g.fillPct,
      hitRatio: t.hits + t.misses > 0 ? t.hits / (t.hits + t.misses) : 0,
      avgLatency: t.hist.mean(), p50: t.hist.quantile(0.5), p95: t.hist.quantile(0.95), p99: t.hist.quantile(0.99),
      windows: this.windows,
    };
  }
}
