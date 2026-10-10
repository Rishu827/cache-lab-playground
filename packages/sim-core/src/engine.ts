import { Cache, type CacheConfig } from "./cache";
import { Metrics, type Summary } from "./metrics";
import { Origin, type OriginConfig } from "./origin";
import { Rng } from "./prng";
import { Scheduler } from "./scheduler";
import { WorkloadGenerator, type WorkloadConfig } from "./workload";

export type StrategyName = "cache-aside" | "read-through" | "write-through" | "write-behind" | "write-around";

export interface Protections {
  /** Concurrent misses for one key share a single origin fetch. */
  coalescing: boolean;
  /** TTLs are randomised by +/- this fraction (0..1) to avoid synchronized expiry. */
  ttlJitter: number;
  /** Serve expired entries for this long while refreshing in the background (0 = off). */
  staleWhileRevalidateMs: number;
}

export type Action =
  | { kind: "expireKey"; key: string }
  | { kind: "expireHotKey" }
  | { kind: "flushCache" }
  | { kind: "crashWriteBehind" }
  | { kind: "originOutage"; durationMs: number }
  | { kind: "originSlowdown"; factor: number; durationMs: number };

export interface SimConfig {
  seed: number;
  durationMs: number;
  windowMs: number;
  workload: WorkloadConfig;
  cache: CacheConfig & { ttlMs: number; latencyMs: number };
  strategy: StrategyName;
  writeBehindFlushMs: number;
  origin: OriginConfig;
  protections: Protections;
  events: { atMs: number; action: Action }[];
}

export interface RequestEvent {
  id: number;
  /** Completion time. */
  t: number;
  startedAt: number;
  op: "read" | "write";
  key: string;
  outcome: "hit" | "miss" | "error" | "write";
  stale: boolean;
  latencyMs: number;
  /** Human-readable trace, e.g. `t=412ms GET k7 → MISS → DB 80ms → SET`. */
  line: string;
}

const LOG_LIMIT = 1000;

export class Simulation {
  readonly sched = new Scheduler();
  readonly cache: Cache;
  readonly origin: Origin;
  readonly metrics: Metrics;
  readonly log: RequestEvent[] = [];
  /** Optional hook, called for every completed request. */
  onRequest?: (e: RequestEvent) => void;

  private rng: Rng;
  private workload: WorkloadGenerator;
  private nextId = 0;
  private issued = new Map<string, number>(); // last version issued per key
  private truth = new Map<string, number>(); // latest acknowledged version per key (consistency oracle)
  private inflight = new Map<string, ((r: { ok: boolean; version: number }, svc: number) => void)[]>();
  private buffer = new Map<string, number>(); // write-behind buffer
  private pendingFlush = new Set<string>();

  constructor(readonly config: SimConfig) {
    this.rng = new Rng(config.seed);
    this.workload = new WorkloadGenerator(config.workload, this.rng);
    this.cache = new Cache(config.cache, this.rng);
    this.origin = new Origin(config.origin, this.sched, this.rng);
    this.metrics = new Metrics(config.windowMs);

    this.scheduleNextArrival();
    this.scheduleTick(config.windowMs);
    for (const ev of config.events) this.sched.schedule(ev.atMs, () => this.inject(ev.action));
    if (config.strategy === "write-behind") this.scheduleFlush();
  }

  get now(): number {
    return this.sched.now;
  }
  get done(): boolean {
    return this.sched.pending === 0;
  }

  /** Process a single event. */
  step(): boolean {
    const ok = this.sched.step();
    this.afterEvent();
    return ok;
  }

  runUntil(t: number): void {
    while (this.sched.nextTime() !== undefined && this.sched.nextTime()! <= t) this.step();
    if (this.sched.now < t) this.sched.now = t;
    this.afterEvent();
  }

  /**
   * Advance virtual time toward `t`, processing at most `maxEvents` events (so a UI frame stays bounded).
   * Returns true if it reached `t`; otherwise the clock stops at the last processed event.
   */
  advanceTo(t: number, maxEvents: number): boolean {
    for (let n = 0; n < maxEvents; n++) {
      const next = this.sched.nextTime();
      if (next === undefined || next > t) {
        if (this.sched.now < t) this.sched.now = t;
        this.afterEvent();
        return true;
      }
      this.step();
    }
    return false;
  }

  /** Latest acknowledged version of a key (the consistency oracle's ground truth). */
  latestVersion(key: string): number {
    return this.truthOf(key);
  }

  runToEnd(): void {
    while (this.step());
  }

  summary(): Summary {
    return this.metrics.summary(this.now, this.gauges(), this.origin.maxQueueDepth);
  }

  /** Apply a failure-injection action right now. */
  inject(action: Action): void {
    switch (action.kind) {
      case "expireKey":
        this.cache.expire(action.key, this.now);
        break;
      case "expireHotKey": {
        const hot = this.cache.snapshot().reduce<string | undefined>((best, e) => (!best || e.hits > this.cache.peek(best)!.hits ? e.key : best), undefined);
        this.cache.expire(hot ?? "k0", this.now);
        break;
      }
      case "flushCache":
        this.cache.clear();
        break;
      case "crashWriteBehind":
        this.metrics.lostWrites += this.buffer.size;
        this.buffer.clear();
        this.cache.clear();
        break;
      case "originOutage":
        this.origin.setOutage(true);
        this.sched.schedule(action.durationMs, () => this.origin.setOutage(false));
        break;
      case "originSlowdown":
        this.origin.setSlowdown(action.factor);
        this.sched.schedule(action.durationMs, () => this.origin.setSlowdown(1));
        break;
    }
  }

  // ---- scheduling -------------------------------------------------------

  private gauges() {
    return {
      fillPct: this.cache.fillPct,
      evictions: this.cache.evictions,
      originRequests: this.origin.requests,
      queueDepth: this.origin.queueDepth,
    };
  }

  private afterEvent() {
    this.metrics.queueDepth(this.origin.queueDepth);
    this.metrics.advance(this.now, this.gauges());
  }

  private scheduleNextArrival() {
    const req = this.workload.next();
    if (req.t > this.config.durationMs) return;
    this.sched.schedule(req.t - this.now, () => {
      this.scheduleNextArrival();
      if (req.op === "read") this.read(req.key);
      else this.write(req.key);
    });
  }

  private scheduleTick(every: number) {
    if (this.now >= this.config.durationMs) return;
    this.sched.schedule(every, () => this.scheduleTick(every));
  }

  private scheduleFlush() {
    this.sched.schedule(this.config.writeBehindFlushMs, () => {
      this.flushBuffer();
      if (this.now < this.config.durationMs || this.buffer.size > 0) this.scheduleFlush();
    });
  }

  private flushBuffer() {
    for (const [key, version] of this.buffer) {
      if (this.pendingFlush.has(key)) continue;
      this.pendingFlush.add(key);
      this.origin.write(key, version, (r) => {
        this.pendingFlush.delete(key);
        if (!r.ok) return; // stays buffered; retried next flush
        if (this.buffer.get(key) === version) this.buffer.delete(key);
        const e = this.cache.peek(key);
        if (e && e.version === version) e.dirty = false;
        this.bumpTruth(key, version);
      });
    }
  }

  // ---- request paths ----------------------------------------------------

  private ttl(): number {
    const { ttlMs } = this.config.cache;
    const j = this.config.protections.ttlJitter;
    return ttlMs > 0 && j > 0 ? ttlMs * (1 + j * (this.rng.next() * 2 - 1)) : ttlMs;
  }

  private truthOf(key: string): number {
    return this.truth.get(key) ?? 0;
  }
  private bumpTruth(key: string, v: number) {
    this.truth.set(key, Math.max(this.truthOf(key), v));
  }

  /** Insert/refresh a cache entry unless the cache already holds a newer version. */
  private putIfNewer(key: string, version: number, dirty = false) {
    const cur = this.cache.peek(key);
    if (cur && cur.version > version) return;
    this.cache.set(key, version, this.now, this.ttl(), dirty);
  }

  private finish(id: number, startedAt: number, op: "read" | "write", key: string, outcome: RequestEvent["outcome"], stale: boolean, trace: string[]) {
    const latencyMs = this.now - startedAt;
    if (op === "read") this.metrics.read(outcome as "hit" | "miss" | "error", latencyMs, stale);
    else this.metrics.write(latencyMs, outcome === "error");
    const line = `t=${Math.round(startedAt)}ms ${op === "read" ? "GET" : "PUT"} ${key} → ${trace.join(" → ")}${stale ? " (STALE)" : ""} [${latencyMs.toFixed(0)}ms]`;
    const ev: RequestEvent = { id, t: this.now, startedAt, op, key, outcome, stale, latencyMs, line };
    this.log.push(ev);
    if (this.log.length > LOG_LIMIT) this.log.shift();
    this.onRequest?.(ev);
  }

  private read(key: string) {
    const id = this.nextId++;
    const t0 = this.now;
    const { latencyMs: cacheMs } = this.config.cache;
    const hit = this.cache.get(key, t0, this.config.protections.staleWhileRevalidateMs);

    if (hit) {
      const version = hit.entry.version;
      const trace = [hit.fresh ? "HIT" : "HIT (expired, serving stale-while-revalidate)"];
      if (!hit.fresh) this.fetch(key, () => {});
      this.sched.schedule(cacheMs, () => this.finish(id, t0, "read", key, "hit", version < this.truthOf(key), trace));
      return;
    }

    this.sched.schedule(cacheMs, () => {
      const trace = ["MISS"];
      this.fetch(key, (r, svc) => {
        if (!r.ok) {
          trace.push("DB ERROR");
          return this.finish(id, t0, "read", key, "error", false, trace);
        }
        trace.push(`DB ${svc.toFixed(0)}ms`, "SET");
        this.finish(id, t0, "read", key, "miss", r.version < this.truthOf(key), trace);
      });
    });
  }

  /** Fetch from origin and populate the cache, coalescing concurrent fetches if enabled. */
  private fetch(key: string, cb: (r: { ok: boolean; version: number }, svc: number) => void) {
    const waiters = this.inflight.get(key);
    if (waiters && this.config.protections.coalescing) {
      waiters.push(cb);
      return;
    }
    const list = [cb];
    if (this.config.protections.coalescing) this.inflight.set(key, list);
    this.origin.read(key, (r, svc) => {
      this.inflight.delete(key);
      if (r.ok) this.putIfNewer(key, r.version);
      for (const w of list) w(r.ok ? { ok: true, version: r.version } : { ok: false, version: 0 }, svc);
    });
  }

  private write(key: string) {
    const id = this.nextId++;
    const t0 = this.now;
    const version = (this.issued.get(key) ?? 0) + 1;
    this.issued.set(key, version);
    const strategy = this.config.strategy;

    if (strategy === "write-behind") {
      this.sched.schedule(this.config.cache.latencyMs, () => {
        this.putIfNewer(key, version, true);
        this.buffer.set(key, version);
        this.bumpTruth(key, version);
        this.finish(id, t0, "write", key, "write", false, ["CACHE SET (dirty)", "BUFFERED"]);
      });
      return;
    }

    this.origin.write(key, version, (r, svc) => {
      if (!r.ok) return this.finish(id, t0, "write", key, "error", false, ["DB ERROR"]);
      this.bumpTruth(key, version);
      const trace = [`DB ${svc.toFixed(0)}ms`];
      if (strategy === "write-through") {
        this.putIfNewer(key, version);
        trace.push("SET");
      } else if (strategy === "write-around") {
        trace.push("(cache bypassed)");
      } else {
        this.cache.delete(key);
        trace.push("DEL");
      }
      this.finish(id, t0, "write", key, "write", false, trace);
    });
  }
}
