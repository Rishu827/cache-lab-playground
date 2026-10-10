import { Cache, type CacheConfig, type CacheEntry, type SetResult } from "./cache";
import { hash32 } from "./hash";
import { Rng } from "./prng";

export interface ClusterConfig {
  nodes: number;
  /** modulo: hash % N (remaps almost everything on resize). consistent: hash ring with virtual nodes. */
  router: "modulo" | "consistent";
  /** Virtual nodes per physical node (consistent routing only). */
  vnodes: number;
}

export interface RemapReport {
  kind: "add" | "remove";
  nodeId: number;
  nodesAfter: number;
  /** Fraction of the whole keyspace that now routes to a different node. */
  remapFraction: number;
  /** Fraction of currently cached entries that are now unreachable on their old node. */
  residentRemapFraction: number;
}

export interface NodeStat {
  id: number;
  size: number;
  capacity: number;
  requests: number;
}

class Router {
  private ids: number[] = [];
  private ring: { point: number; id: number }[] = [];

  constructor(private kind: ClusterConfig["router"], private vnodes: number) {}

  setNodes(ids: number[]) {
    this.ids = [...ids].sort((a, b) => a - b);
    if (this.kind === "consistent") {
      this.ring = this.ids.flatMap((id) => Array.from({ length: Math.max(1, this.vnodes) }, (_, v) => ({ point: hash32(`node${id}#${v}`), id })));
      this.ring.sort((a, b) => a.point - b.point);
    }
  }

  route(key: string): number {
    const h = hash32(key);
    if (this.kind === "modulo") return this.ids[h % this.ids.length]!;
    let lo = 0;
    let hi = this.ring.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (this.ring[mid]!.point < h) lo = mid + 1;
      else hi = mid;
    }
    return this.ring[lo % this.ring.length]!.id;
  }
}

/**
 * N cache nodes behind a router, exposed with the same surface as a single Cache.
 * A one-node cluster behaves exactly like a plain Cache.
 */
export class CacheCluster {
  private nodes = new Map<number, Cache>();
  private requests = new Map<number, number>();
  private router: Router;
  private nextId = 0;
  private retiredEvictions = 0;
  lastRemap: RemapReport | null = null;
  /** Every resize so far, oldest first. */
  readonly remaps: RemapReport[] = [];

  constructor(private nodeConfig: CacheConfig, cfg: ClusterConfig, private rng: Rng, private sample: string[]) {
    this.router = new Router(cfg.router, cfg.vnodes);
    for (let i = 0; i < Math.max(1, cfg.nodes); i++) this.spawn();
    this.router.setNodes([...this.nodes.keys()]);
  }

  private spawn(): number {
    const id = this.nextId++;
    this.nodes.set(id, new Cache(this.nodeConfig, this.rng));
    this.requests.set(id, 0);
    return id;
  }

  private snapshotRoutes(): Map<string, number> {
    return new Map(this.sample.map((k) => [k, this.router.route(k)]));
  }

  private report(kind: RemapReport["kind"], nodeId: number, before: Map<string, number>, resident: CacheEntry[], residentBefore: Map<string, number>): RemapReport {
    let moved = 0;
    for (const [k, id] of before) if (this.router.route(k) !== id) moved++;
    let residentMoved = 0;
    for (const e of resident) if (this.router.route(e.key) !== residentBefore.get(e.key)) residentMoved++;
    const rep: RemapReport = {
      kind,
      nodeId,
      nodesAfter: this.nodes.size,
      remapFraction: before.size ? moved / before.size : 0,
      residentRemapFraction: resident.length ? residentMoved / resident.length : 0,
    };
    this.remaps.push(rep);
    return (this.lastRemap = rep);
  }

  addNode(): RemapReport {
    const before = this.snapshotRoutes();
    const resident = this.snapshot();
    const residentBefore = new Map(resident.map((e) => [e.key, this.router.route(e.key)]));
    const id = this.spawn();
    this.router.setNodes([...this.nodes.keys()]);
    return this.report("add", id, before, resident, residentBefore);
  }

  /** Remove a node (default: the newest). Its cached entries are lost. Returns null if only one node remains. */
  removeNode(id?: number): RemapReport | null {
    if (this.nodes.size <= 1) return null;
    const target = id !== undefined && this.nodes.has(id) ? id : Math.max(...this.nodes.keys());
    const before = this.snapshotRoutes();
    const resident = this.snapshot();
    const residentBefore = new Map(resident.map((e) => [e.key, this.router.route(e.key)]));
    this.retiredEvictions += this.nodes.get(target)!.evictions;
    this.nodes.delete(target);
    this.router.setNodes([...this.nodes.keys()]);
    const stillThere = resident.filter((e) => residentBefore.get(e.key) !== target);
    const r = this.report("remove", target, before, resident, residentBefore);
    // Entries that lived on the removed node are gone, which counts as remapped.
    r.residentRemapFraction = resident.length ? 1 - stillThere.filter((e) => this.router.route(e.key) === residentBefore.get(e.key)).length / resident.length : 0;
    return r;
  }

  private nodeFor(key: string): Cache {
    const id = this.router.route(key);
    this.requests.set(id, (this.requests.get(id) ?? 0) + 1);
    return this.nodes.get(id)!;
  }

  // ---- Cache-compatible surface ----

  get config(): CacheConfig {
    return { ...this.nodeConfig, capacity: this.nodeConfig.capacity * this.nodes.size };
  }
  get nodeCount(): number {
    return this.nodes.size;
  }
  get size(): number {
    let n = 0;
    for (const c of this.nodes.values()) n += c.size;
    return n;
  }
  get fillPct(): number {
    const cap = this.config.capacity;
    return cap === 0 ? 0 : (this.size / cap) * 100;
  }
  get evictions(): number {
    let n = this.retiredEvictions;
    for (const c of this.nodes.values()) n += c.evictions;
    return n;
  }
  get recentEvictions(): string[] {
    return [...this.nodes.values()].flatMap((c) => c.recentEvictions).slice(-20);
  }
  nodeStats(): NodeStat[] {
    return [...this.nodes.entries()].map(([id, c]) => ({ id, size: c.size, capacity: this.nodeConfig.capacity, requests: this.requests.get(id) ?? 0 }));
  }

  get(key: string, now: number, staleMs = 0) {
    return this.nodeFor(key).get(key, now, staleMs);
  }
  set(key: string, version: number, now: number, ttlMs: number, dirty = false, tag?: string): SetResult {
    return this.nodeFor(key).set(key, version, now, ttlMs, dirty, tag);
  }
  delete(key: string): boolean {
    return this.nodeFor(key).delete(key);
  }
  peek(key: string): CacheEntry | undefined {
    return this.nodes.get(this.router.route(key))!.peek(key);
  }
  expire(key: string, now: number): boolean {
    return this.nodeFor(key).expire(key, now);
  }
  deleteByTag(tag: string): number {
    let n = 0;
    for (const c of this.nodes.values()) n += c.deleteByTag(tag);
    return n;
  }
  clear(): void {
    for (const c of this.nodes.values()) c.clear();
  }
  snapshot(): CacheEntry[] {
    return [...this.nodes.values()].flatMap((c) => c.snapshot());
  }
}
