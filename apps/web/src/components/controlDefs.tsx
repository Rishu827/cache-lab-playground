import type { ControlId } from "@cache-lab/scenarios";
import type { PolicyName, SimConfig, StrategyName } from "@cache-lab/sim-core";
import type { ReactNode } from "react";
import { getSkew, layerTtl, setSkew, withCache, withCluster, withInvalidation, withLayerTtl, withOrigin, withProtections, withWorkload } from "../lib/configEdit";

const POLICIES: PolicyName[] = ["fifo", "lru", "lfu", "random", "tinylfu"];
const STRATEGIES: StrategyName[] = ["cache-aside", "read-through", "write-through", "write-behind", "write-around"];

function Slider({ label, hint, value, min, max, step = 1, suffix = "", onChange }: { label: string; hint?: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange(n: number): void }) {
  return (
    <label className="field">
      <span>
        {label} <output>{value}{suffix}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Pick<T extends string>({ label, hint, value, options, onChange }: { label: string; hint?: string; value: T; options: T[]; onChange(v: T): void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Toggle({ label, hint, checked, onChange }: { label: string; hint?: string; checked: boolean; onChange(v: boolean): void }) {
  return (
    <label className="check field">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      <span>
        {label}
        {hint && <small>{hint}</small>}
      </span>
    </label>
  );
}

export type Group = "Workload" | "Cache" | "Origin (database)" | "Protections" | "Invalidation" | "Layers" | "Cluster";
export const GROUP_ORDER: Group[] = ["Workload", "Cache", "Layers", "Cluster", "Origin (database)", "Protections", "Invalidation"];

export interface ControlDef {
  id: ControlId;
  group: Group;
  /** Whether it makes sense for this config (e.g. flush interval only for write-behind). */
  visible: boolean;
  node: ReactNode;
}

/** Every control, defined once; the full view groups them, the simple view picks a few by id. */
export function controlDefs(c: SimConfig, set: (c: SimConfig) => void): ControlDef[] {
  const skew = getSkew(c);
  const browser = layerTtl(c, "browser");
  const cdn = layerTtl(c, "cdn");
  return [
    { id: "rate", group: "Workload", visible: true, node: <Slider label="Request rate" value={c.workload.ratePerSec} min={10} max={1000} step={10} suffix="/s" onChange={(n) => set(withWorkload(c, { ratePerSec: n }))} /> },
    { id: "readRatio", group: "Workload", visible: true, node: <Slider label="Reads" hint="The rest are writes." value={Math.round(c.workload.readRatio * 100)} min={0} max={100} suffix="%" onChange={(n) => set(withWorkload(c, { readRatio: n / 100 }))} /> },
    { id: "keyspace", group: "Workload", visible: true, node: <Slider label="Distinct keys" value={c.workload.keyspace} min={10} max={5000} step={10} onChange={(n) => set(withWorkload(c, { keyspace: n }))} /> },
    { id: "skew", group: "Workload", visible: skew !== undefined, node: <Slider label="Popularity skew" hint="Higher = a few keys get most of the traffic." value={skew ?? 1} min={0.5} max={2} step={0.1} onChange={(n) => set(setSkew(c, Math.round(n * 10) / 10))} /> },
    { id: "missingRatio", group: "Workload", visible: true, node: <Slider label="Lookups for missing keys" hint="Requests for IDs that don't exist." value={Math.round((c.workload.missingRatio ?? 0) * 100)} min={0} max={90} suffix="%" onChange={(n) => set(withWorkload(c, { missingRatio: n / 100 }))} /> },

    { id: "capacity", group: "Cache", visible: true, node: <Slider label={c.cluster.nodes > 1 ? "Capacity per node" : "Cache size"} hint="How many entries fit." value={c.cache.capacity} min={0} max={1000} step={5} suffix=" entries" onChange={(n) => set(withCache(c, { capacity: n }))} /> },
    { id: "ttl", group: "Cache", visible: true, node: <Slider label="Time to live (TTL)" hint="0 = entries never expire." value={c.cache.ttlMs / 1000} min={0} max={120} suffix="s" onChange={(n) => set(withCache(c, { ttlMs: n * 1000 }))} /> },
    { id: "policy", group: "Cache", visible: true, node: <Pick label="Eviction policy" hint="Who gets thrown out when the cache is full." value={c.cache.policy} options={POLICIES} onChange={(v) => set(withCache(c, { policy: v }))} /> },
    { id: "strategy", group: "Cache", visible: true, node: <Pick label="Write strategy" hint="How writes reach the cache and database." value={c.strategy} options={STRATEGIES} onChange={(v) => set({ ...c, strategy: v })} /> },
    { id: "flush", group: "Cache", visible: c.strategy === "write-behind", node: <Slider label="Write-behind flush every" value={c.writeBehindFlushMs / 1000} min={0.5} max={10} step={0.5} suffix="s" onChange={(n) => set({ ...c, writeBehindFlushMs: n * 1000 })} /> },

    { id: "browserTtl", group: "Layers", visible: browser !== undefined, node: <Slider label="Browser cache TTL" hint="0 = no-store." value={(browser ?? 0) / 1000} min={0} max={120} suffix="s" onChange={(n) => set(withLayerTtl(c, "browser", n * 1000))} /> },
    { id: "cdnTtl", group: "Layers", visible: cdn !== undefined, node: <Slider label="CDN TTL" hint="0 = no-store." value={(cdn ?? 0) / 1000} min={0} max={120} suffix="s" onChange={(n) => set(withLayerTtl(c, "cdn", n * 1000))} /> },

    { id: "nodes", group: "Cluster", visible: true, node: <Slider label="Cache nodes" value={c.cluster.nodes} min={1} max={12} onChange={(n) => set(withCluster(c, { nodes: n }))} /> },
    { id: "router", group: "Cluster", visible: c.cluster.nodes > 1, node: <Pick label="Router" hint="modulo = hash % N. consistent = hash ring." value={c.cluster.router} options={["modulo", "consistent"]} onChange={(v) => set(withCluster(c, { router: v }))} /> },
    { id: "vnodes", group: "Cluster", visible: c.cluster.nodes > 1 && c.cluster.router === "consistent", node: <Slider label="Virtual nodes per node" value={c.cluster.vnodes} min={1} max={300} onChange={(n) => set(withCluster(c, { vnodes: n }))} /> },

    { id: "originLatency", group: "Origin (database)", visible: true, node: <Slider label="Database latency" value={c.origin.latencyMs} min={5} max={500} step={5} suffix=" ms" onChange={(n) => set(withOrigin(c, { latencyMs: n }))} /> },
    { id: "concurrency", group: "Origin (database)", visible: true, node: <Slider label="Concurrent queries" hint="More than this and requests queue." value={c.origin.concurrency} min={1} max={100} onChange={(n) => set(withOrigin(c, { concurrency: n }))} /> },
    { id: "failureRate", group: "Origin (database)", visible: true, node: <Slider label="Failure rate" value={Math.round(c.origin.failureRate * 100)} min={0} max={50} suffix="%" onChange={(n) => set(withOrigin(c, { failureRate: n / 100 }))} /> },

    { id: "coalescing", group: "Protections", visible: true, node: <Toggle label="Request coalescing" hint="Concurrent misses for one key share one database call." checked={c.protections.coalescing} onChange={(v) => set(withProtections(c, { coalescing: v }))} /> },
    { id: "lease", group: "Protections", visible: true, node: <Toggle label="Lock / lease" hint="One request fetches; others wait and re-check the cache." checked={c.protections.lease} onChange={(v) => set(withProtections(c, { lease: v }))} /> },
    { id: "jitter", group: "Protections", visible: true, node: <Slider label="TTL jitter" hint="Spreads expiries so keys don't all expire together." value={Math.round(c.protections.ttlJitter * 100)} min={0} max={50} suffix="%" onChange={(n) => set(withProtections(c, { ttlJitter: n / 100 }))} /> },
    { id: "swr", group: "Protections", visible: true, node: <Slider label="Stale-while-revalidate" hint="Serve expired data this long while refreshing." value={c.protections.staleWhileRevalidateMs / 1000} min={0} max={30} suffix="s" onChange={(n) => set(withProtections(c, { staleWhileRevalidateMs: n * 1000 }))} /> },
    { id: "negativeCache", group: "Protections", visible: true, node: <Slider label="Negative caching" hint="Remember “does not exist” for this long (0 = off)." value={c.protections.negativeCacheTtlMs / 1000} min={0} max={60} suffix="s" onChange={(n) => set(withProtections(c, { negativeCacheTtlMs: n * 1000 }))} /> },
    { id: "bloom", group: "Protections", visible: true, node: <Slider label="Bloom filter" hint="Bits per key (0 = off). More bits, fewer false positives." value={c.protections.bloomBitsPerKey} min={0} max={16} onChange={(n) => set(withProtections(c, { bloomBitsPerKey: n }))} /> },

    { id: "versionedKeys", group: "Invalidation", visible: true, node: <Toggle label="Versioned keys" hint="New version = new cache key, so old data is never served." checked={c.invalidation.versionedKeys} onChange={(v) => set(withInvalidation(c, { versionedKeys: v }))} /> },
    { id: "tagOnWrite", group: "Invalidation", visible: true, node: <Toggle label="Invalidate by tag on write" hint="A write clears its whole tag group (8 groups)." checked={c.invalidation.onWrite === "tag"} onChange={(v) => set(withInvalidation(c, { onWrite: v ? "tag" : "key", tagGroups: v ? Math.max(8, c.invalidation.tagGroups) : c.invalidation.tagGroups }))} /> },
  ];
}
