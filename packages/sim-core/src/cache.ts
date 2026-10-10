import { createPolicy, type EvictionPolicy, type PolicyName } from "./eviction";
import { Rng } from "./prng";

export interface CacheEntry {
  key: string;
  version: number;
  storedAt: number;
  /** Absolute expiry time in ms; Infinity means no TTL. */
  expiresAt: number;
  hits: number;
  dirty: boolean;
}

export interface CacheConfig {
  capacity: number;
  policy: PolicyName;
}

export type SetResult = { stored: boolean; evicted?: string; rejected?: boolean };

export class Cache {
  private entries = new Map<string, CacheEntry>();
  private policy: EvictionPolicy;
  evictions = 0;
  /** Keys recently evicted, for UI highlighting. */
  recentEvictions: string[] = [];

  constructor(readonly config: CacheConfig, rng: Rng) {
    this.policy = createPolicy(config.policy, config.capacity, rng);
  }

  get size(): number {
    return this.entries.size;
  }

  get fillPct(): number {
    return this.config.capacity === 0 ? 0 : (this.entries.size / this.config.capacity) * 100;
  }

  /**
   * Look up a key. Expired entries are returned only if within `staleMs` past expiry
   * (for stale-while-revalidate); otherwise they are removed and reported as a miss.
   */
  get(key: string, now: number, staleMs = 0): { entry: CacheEntry; fresh: boolean } | undefined {
    this.policy.onLookup?.(key);
    const e = this.entries.get(key);
    if (!e) return undefined;
    if (now >= e.expiresAt) {
      if (now < e.expiresAt + staleMs) return { entry: e, fresh: false };
      this.remove(key);
      return undefined;
    }
    e.hits++;
    this.policy.onAccess(key);
    return { entry: e, fresh: true };
  }

  set(key: string, version: number, now: number, ttlMs: number, dirty = false): SetResult {
    const existing = this.entries.get(key);
    if (existing) {
      existing.version = version;
      existing.storedAt = now;
      existing.expiresAt = ttlMs > 0 ? now + ttlMs : Infinity;
      existing.dirty = dirty;
      this.policy.onAccess(key);
      return { stored: true };
    }
    if (this.config.capacity <= 0) return { stored: false, rejected: true };
    let evicted: string | undefined;
    if (this.entries.size >= this.config.capacity) {
      const victim = this.policy.victim();
      if (this.policy.admit && !this.policy.admit(key, victim)) return { stored: false, rejected: true };
      this.remove(victim);
      this.evictions++;
      this.recentEvictions.push(victim);
      if (this.recentEvictions.length > 20) this.recentEvictions.shift();
      evicted = victim;
    }
    this.entries.set(key, { key, version, storedAt: now, expiresAt: ttlMs > 0 ? now + ttlMs : Infinity, hits: 0, dirty });
    this.policy.onInsert(key);
    return { stored: true, evicted };
  }

  delete(key: string): boolean {
    return this.remove(key);
  }

  /** Force-expire a key so the next read misses (failure injection). */
  expire(key: string, now: number): boolean {
    const e = this.entries.get(key);
    if (!e) return false;
    e.expiresAt = now;
    return true;
  }

  clear(): void {
    for (const k of [...this.entries.keys()]) this.remove(k);
  }

  snapshot(): CacheEntry[] {
    return [...this.entries.values()];
  }

  peek(key: string): CacheEntry | undefined {
    return this.entries.get(key);
  }

  private remove(key: string): boolean {
    if (!this.entries.delete(key)) return false;
    this.policy.onRemove(key);
    return true;
  }
}
