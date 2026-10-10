import { BloomFilter } from "./bloom";
import { Cache, type CacheConfig } from "./cache";
import { CacheCluster, type ClusterConfig, type RemapReport } from "./cluster";
import type { PolicyName } from "./eviction";
import { Metrics, type Summary } from "./metrics";
import { Origin, type OriginConfig } from "./origin";
import { Rng } from "./prng";
import { Scheduler } from "./scheduler";
import { isMissingKey, keyName, WorkloadGenerator, type WorkloadConfig } from "./workload";

export type StrategyName = "cache-aside" | "read-through" | "write-through" | "write-behind" | "write-around";

export interface Protections {
  /** Concurrent misses for one key share a single origin fetch. */
  coalescing: boolean;
  /** TTLs are randomised by +/- this fraction (0..1) to avoid synchronized expiry. */
  ttlJitter: number;
  /** Serve expired entries for this long while refreshing in the background (0 = off). */
  staleWhileRevalidateMs: number;
  /** Cache "does not exist" answers for this long (0 = off). */
  negativeCacheTtlMs: number;
  /** Bloom filter bits per existing key; lookups for keys not in the set skip cache and origin (0 = off). */
  bloomBitsPerKey: number;
  /** One request per key holds a lease to fetch; others poll the cache instead of hitting the origin. */
  lease: boolean;
  leaseRetryMs: number;
}

export interface Invalidation {
  /** Keys are grouped into this many tags (`g0`, `g1`, ...). 0 = no tags. */
  tagGroups: number;
  /** What a write invalidates: just its key, or its whole tag group. */
  onWrite: "key" | "tag";
  /** Put the latest version in the cache key (`k7@3`) so a new version can never be served from an old entry. */
  versionedKeys: boolean;
}

/** An extra cache in front of the main cache (browser, CDN, ...). */
export interface LayerConfig {
  name: string;
  /** Shared by all clients (CDN) or private per client (browser). */
  shared: boolean;
  capacity: number;
  policy: PolicyName;
  /** Freshness lifetime (Cache-Control max-age). 0 means no-store: the layer never caches. */
  ttlMs: number;
  latencyMs: number;
  /** Whether a write purges this layer. Browsers cannot be purged. */
  purgeOnWrite: boolean;
}

export type Action =
  | { kind: "expireKey"; key: string }
  | { kind: "expireHotKey" }
  | { kind: "flushCache" }
  | { kind: "crashWriteBehind" }
  | { kind: "originOutage"; durationMs: number }
  | { kind: "originSlowdown"; factor: number; durationMs: number }
  /** Ship new content: every key gets a new version. */
  | { kind: "deploy" }
  /** Purge shared layers (CDN), not browsers. */
  | { kind: "purgeShared" }
  | { kind: "invalidateTag"; tag: string }
  | { kind: "addNode" }
  | { kind: "removeNode" };

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
  invalidation: Invalidation;
  layers: LayerConfig[];
  cluster: ClusterConfig;
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
  /** Which tier answered: a layer name, "cache", "bloom" or "origin". */
  servedBy: string;
  stale: boolean;
  latencyMs: number;
  /** Human-readable trace, e.g. `t=412ms GET k7 → MISS → DB 80ms → SET`. */
  line: string;
}

interface Tier {
  cfg: LayerConfig;
  caches: Map<number, Cache>;
}

type FetchResult = { ok: boolean; version: number };
type FetchCb = (r: FetchResult, svc: number) => void;

const LOG_LIMIT = 1000;

/** Strip the `@version` suffix that versioned keys add. */
export const baseKey = (cacheKey: string) => cacheKey.split("@")[0]!;

export class Simulation {
  readonly sched = new Scheduler();
  readonly cache: CacheCluster;
  readonly tiers: Tier[];
  readonly origin: Origin;
  readonly metrics: Metrics;
  readonly log: RequestEvent[] = [];
  /** Optional hook, called for every completed request. */
  onRequest?: (e: RequestEvent) => void;

  private rng: Rng;
  private workload: WorkloadGenerator;
  private bloom?: BloomFilter;
  private nextId = 0;
  private epoch = 0; // bumped by deploys; every key's version is at least this
  private issued = new Map<string, number>(); // last version issued per key
  private truth = new Map<string, number>(); // latest acknowledged version per key (consistency oracle)
  private inflight = new Map<string, FetchCb[]>();
  private leases = new Set<string>();
  private buffer = new Map<string, number>(); // write-behind buffer
  private pendingFlush = new Set<string>();

  constructor(readonly config: SimConfig) {
    this.rng = new Rng(config.seed);
    this.workload = new WorkloadGenerator(config.workload, this.rng);
    const sample = Array.from({ length: config.workload.keyspace }, (_, i) => keyName(i));
    this.cache = new CacheCluster(config.cache, config.cluster, this.rng, sample);
    this.tiers = config.layers.map((cfg) => ({ cfg, caches: new Map() }));
    this.origin = new Origin(config.origin, this.sched, this.rng);
    this.metrics = new Metrics(config.windowMs);
    if (config.protections.bloomBitsPerKey > 0) {
      this.bloom = new BloomFilter(config.workload.keyspace, config.protections.bloomBitsPerKey);
      for (const k of sample) this.bloom.add(k);
    }

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

  /** Latest acknowledged version of a key (the consistency oracle's ground truth). -1 means "does not exist". */
  latestVersion(key: string): number {
    return this.truthOf(key);
  }

  runToEnd(): void {
    while (this.step());
  }

  summary(): Summary {
    return this.metrics.summary(this.now, this.gauges(), this.origin.maxQueueDepth, {
      nodeCount: this.cache.nodeCount,
      lastRemap: this.cache.lastRemap,
      remaps: this.cache.remaps,
    });
  }

  /** The cache for a tier and client (browser caches are per client). */
  tierCache(tier: Tier, client: number): Cache {
    const id = tier.cfg.shared ? 0 : client;
    let c = tier.caches.get(id);
    if (!c) tier.caches.set(id, (c = new Cache({ capacity: tier.cfg.capacity, policy: tier.cfg.policy }, this.rng)));
    return c;
  }

  /** Apply a failure-injection action right now. */
  inject(action: Action): RemapReport | null | void {
    switch (action.kind) {
      case "expireKey":
        this.cache.expire(this.ckey(action.key), this.now);
        break;
      case "expireHotKey": {
        const hot = this.cache.snapshot().reduce<string | undefined>((best, e) => (!best || e.hits > this.cache.peek(best)!.hits ? e.key : best), undefined);
        this.cache.expire(hot ?? this.ckey("k0"), this.now);
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
      case "deploy":
        this.epoch++;
        this.origin.setFloor(this.epoch);
        break;
      case "purgeShared":
        for (const t of this.tiers) if (t.cfg.shared) for (const c of t.caches.values()) c.clear();
        break;
      case "invalidateTag":
        this.invalidateTag(action.tag);
        break;
      case "addNode":
        return this.cache.addNode();
      case "removeNode":
        return this.cache.removeNode();
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
      if (req.op === "read") this.read(req.key, req.client);
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
        const e = this.cache.peek(this.ckeyAt(key, version));
        if (e && e.version === version) e.dirty = false;
        this.bumpTruth(key, version);
      });
    }
  }

  // ---- helpers ----------------------------------------------------------

  private ttl(ttlMs = this.config.cache.ttlMs): number {
    const j = this.config.protections.ttlJitter;
    return ttlMs > 0 && j > 0 ? ttlMs * (1 + j * (this.rng.next() * 2 - 1)) : ttlMs;
  }

  private truthOf(key: string): number {
    if (isMissingKey(key)) return -1;
    return Math.max(this.truth.get(key) ?? 0, this.epoch);
  }
  private bumpTruth(key: string, v: number) {
    this.truth.set(key, Math.max(this.truth.get(key) ?? 0, v));
  }

  /** Cache key for reading `key` right now. */
  private ckey(key: string): string {
    return this.config.invalidation.versionedKeys && !isMissingKey(key) ? `${key}@${this.truthOf(key)}` : key;
  }
  private ckeyAt(key: string, version: number): string {
    return this.config.invalidation.versionedKeys && version >= 0 ? `${key}@${version}` : key;
  }

  private tagOf(key: string): string | undefined {
    const groups = this.config.invalidation.tagGroups;
    if (groups <= 0 || isMissingKey(key)) return undefined;
    const n = Number(key.slice(1));
    return Number.isFinite(n) ? `g${n % groups}` : undefined;
  }

  private invalidateTag(tag: string) {
    this.cache.deleteByTag(tag);
    for (const t of this.tiers) if (t.cfg.shared) for (const c of t.caches.values()) c.deleteByTag(tag);
  }

  /** Insert/refresh a main-cache entry unless the cache already holds a newer version. */
  private putIfNewer(key: string, version: number, dirty = false, ttlMs = this.ttl()) {
    const ck = this.ckeyAt(key, version);
    const cur = this.cache.peek(ck);
    if (cur && cur.version > version) return;
    this.cache.set(ck, version, this.now, ttlMs, dirty, this.tagOf(key));
  }

  /** Populate every layer on the way back to the client. */
  private fillTiers(key: string, version: number, client: number, upTo = this.tiers.length) {
    if (version < 0) return;
    for (let i = 0; i < upTo; i++) {
      const t = this.tiers[i]!;
      if (t.cfg.ttlMs <= 0) continue;
      this.tierCache(t, client).set(this.ckeyAt(key, version), version, this.now, this.ttl(t.cfg.ttlMs), false, this.tagOf(key));
    }
  }

  private purgeLayers(key: string) {
    for (const t of this.tiers) if (t.cfg.purgeOnWrite && t.cfg.shared) for (const c of t.caches.values()) c.delete(key);
  }

  private finish(id: number, startedAt: number, op: "read" | "write", key: string, outcome: RequestEvent["outcome"], stale: boolean, trace: string[], servedBy: string) {
    const latencyMs = this.now - startedAt;
    if (op === "read") this.metrics.read(outcome as "hit" | "miss" | "error", latencyMs, stale, servedBy);
    else this.metrics.write(latencyMs, outcome === "error");
    const line = `t=${Math.round(startedAt)}ms ${op === "read" ? "GET" : "PUT"} ${key} → ${trace.join(" → ")}${stale ? " (STALE)" : ""} [${latencyMs.toFixed(0)}ms]`;
    const ev: RequestEvent = { id, t: this.now, startedAt, op, key, outcome, servedBy, stale, latencyMs, line };
    this.log.push(ev);
    if (this.log.length > LOG_LIMIT) this.log.shift();
    this.onRequest?.(ev);
  }

  // ---- read path --------------------------------------------------------

  private read(key: string, client: number) {
    const id = this.nextId++;
    const t0 = this.now;
    const { latencyMs: cacheMs } = this.config.cache;

    // Bloom filter: a key that is definitely absent never reaches the cache or origin.
    if (this.bloom && !this.bloom.mightContain(key)) {
      this.sched.schedule(cacheMs, () => this.finish(id, t0, "read", key, "hit", false, ["BLOOM: not in set", "NOT FOUND"], "bloom"));
      return;
    }

    const ck = this.ckey(key);
    let lat = 0;

    // Layers in front of the main cache, nearest first.
    for (let i = 0; i < this.tiers.length; i++) {
      const t = this.tiers[i]!;
      lat += t.cfg.latencyMs;
      const hit = this.tierCache(t, client).get(ck, this.now);
      if (hit?.fresh) {
        const version = hit.entry.version;
        this.fillTiers(key, version, client, i);
        this.sched.schedule(lat, () => this.finish(id, t0, "read", key, "hit", version < this.truthOf(key), [`${t.cfg.name.toUpperCase()} HIT`], t.cfg.name));
        return;
      }
    }

    lat += cacheMs;
    const hit = this.cache.get(ck, this.now, this.config.protections.staleWhileRevalidateMs);
    if (hit) {
      const version = hit.entry.version;
      const trace = [version < 0 ? "NEGATIVE HIT (does not exist)" : hit.fresh ? "HIT" : "HIT (expired, serving stale-while-revalidate)"];
      if (!hit.fresh) this.fetch(key, () => {});
      this.fillTiers(key, version, client);
      this.sched.schedule(lat, () => this.finish(id, t0, "read", key, "hit", version < this.truthOf(key), trace, "cache"));
      return;
    }

    this.sched.schedule(lat, () => this.miss(id, t0, key, client, ["MISS"], false));
  }

  private miss(id: number, t0: number, key: string, client: number, trace: string[], waited: boolean) {
    const { lease, coalescing, leaseRetryMs } = this.config.protections;
    if (lease && !coalescing && this.leases.has(key)) {
      // Someone else holds the lease: poll the cache instead of hitting the origin.
      if (!waited) trace.push("WAIT (lease held)");
      this.sched.schedule(leaseRetryMs, () => {
        const h = this.cache.get(this.ckey(key), this.now);
        if (h) {
          this.fillTiers(key, h.entry.version, client);
          trace.push("HIT");
          return this.finish(id, t0, "read", key, "hit", h.entry.version < this.truthOf(key), trace, "cache");
        }
        this.miss(id, t0, key, client, trace, true);
      });
      return;
    }
    if (lease) this.leases.add(key);
    this.fetch(key, (r, svc) => {
      if (!r.ok) {
        trace.push("DB ERROR");
        return this.finish(id, t0, "read", key, "error", false, trace, "origin");
      }
      this.fillTiers(key, r.version, client);
      if (r.version < 0) trace.push(`DB ${svc.toFixed(0)}ms`, this.config.protections.negativeCacheTtlMs > 0 ? "NOT FOUND (cached)" : "NOT FOUND");
      else trace.push(`DB ${svc.toFixed(0)}ms`, "SET");
      this.finish(id, t0, "read", key, "miss", r.version < this.truthOf(key), trace, "origin");
    });
  }

  /** Fetch from origin and populate the cache, coalescing concurrent fetches if enabled. */
  private fetch(key: string, cb: FetchCb) {
    const waiters = this.inflight.get(key);
    if (waiters && this.config.protections.coalescing) {
      waiters.push(cb);
      return;
    }
    const list = [cb];
    if (this.config.protections.coalescing) this.inflight.set(key, list);
    this.origin.read(key, (r, svc) => {
      this.inflight.delete(key);
      this.leases.delete(key);
      if (r.ok) {
        if (r.version >= 0) this.putIfNewer(key, r.version);
        else if (this.config.protections.negativeCacheTtlMs > 0) this.putIfNewer(key, -1, false, this.config.protections.negativeCacheTtlMs);
      }
      for (const w of list) w(r.ok ? { ok: true, version: r.version } : { ok: false, version: 0 }, svc);
    });
  }

  // ---- write path -------------------------------------------------------

  private write(key: string) {
    const id = this.nextId++;
    const t0 = this.now;
    const version = Math.max(this.issued.get(key) ?? 0, this.epoch) + 1;
    this.issued.set(key, version);
    const { strategy } = this.config;
    const { versionedKeys, onWrite } = this.config.invalidation;

    if (strategy === "write-behind") {
      this.sched.schedule(this.config.cache.latencyMs, () => {
        this.putIfNewer(key, version, true);
        this.buffer.set(key, version);
        this.bumpTruth(key, version);
        this.purgeLayers(key);
        this.finish(id, t0, "write", key, "write", false, ["CACHE SET (dirty)", "BUFFERED"], "cache");
      });
      return;
    }

    this.origin.write(key, version, (r, svc) => {
      if (!r.ok) return this.finish(id, t0, "write", key, "error", false, ["DB ERROR"], "origin");
      this.bumpTruth(key, version);
      this.purgeLayers(key);
      const trace = [`DB ${svc.toFixed(0)}ms`];
      if (strategy === "write-through") {
        this.putIfNewer(key, version);
        trace.push("SET");
      } else if (strategy === "write-around") {
        trace.push("(cache bypassed)");
      } else if (versionedKeys) {
        trace.push("NEW VERSION (old key left to expire)");
      } else if (onWrite === "tag" && this.tagOf(key)) {
        this.invalidateTag(this.tagOf(key)!);
        trace.push(`DEL tag ${this.tagOf(key)}`);
      } else {
        this.cache.delete(key);
        trace.push("DEL");
      }
      this.finish(id, t0, "write", key, "write", false, trace, "origin");
    });
  }
}
