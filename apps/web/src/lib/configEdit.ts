import type { Pattern, SimConfig } from "@cache-lab/sim-core";

function mapPattern(p: Pattern, f: (p: Pattern) => Pattern): Pattern {
  if (p.kind === "mix") return { ...p, parts: p.parts.map((x) => ({ ...x, pattern: mapPattern(x.pattern, f) })) };
  return f(p);
}

function findZipf(p: Pattern): number | undefined {
  if (p.kind === "zipf") return p.skew;
  if (p.kind === "mix") for (const x of p.parts) { const s = findZipf(x.pattern); if (s !== undefined) return s; }
  return undefined;
}

/** Skew of the first Zipf pattern found, or undefined if the workload has none. */
export function getSkew(c: SimConfig): number | undefined {
  for (const s of c.workload.segments) { const k = findZipf(s.pattern); if (k !== undefined) return k; }
  return undefined;
}

export function setSkew(c: SimConfig, skew: number): SimConfig {
  const segments = c.workload.segments.map((s) => ({ ...s, pattern: mapPattern(s.pattern, (p) => (p.kind === "zipf" ? { ...p, skew } : p)) }));
  return { ...c, workload: { ...c.workload, segments } };
}

/** Immutable nested update helpers keep the controls panel terse. */
export const withCache = (c: SimConfig, p: Partial<SimConfig["cache"]>): SimConfig => ({ ...c, cache: { ...c.cache, ...p } });
export const withOrigin = (c: SimConfig, p: Partial<SimConfig["origin"]>): SimConfig => ({ ...c, origin: { ...c.origin, ...p } });
export const withProtections = (c: SimConfig, p: Partial<SimConfig["protections"]>): SimConfig => ({ ...c, protections: { ...c.protections, ...p } });
export const withWorkload = (c: SimConfig, p: Partial<SimConfig["workload"]>): SimConfig => ({ ...c, workload: { ...c.workload, ...p } });

export const withInvalidation = (c: SimConfig, p: Partial<SimConfig["invalidation"]>): SimConfig => ({ ...c, invalidation: { ...c.invalidation, ...p } });
export const withCluster = (c: SimConfig, p: Partial<SimConfig["cluster"]>): SimConfig => ({ ...c, cluster: { ...c.cluster, ...p } });

/** Set the TTL of the layer with this name (0 = no-store). */
export const withLayerTtl = (c: SimConfig, name: string, ttlMs: number): SimConfig => ({ ...c, layers: c.layers.map((l) => (l.name === name ? { ...l, ttlMs } : l)) });
export const layerTtl = (c: SimConfig, name: string): number | undefined => c.layers.find((l) => l.name === name)?.ttlMs;

/** Replace the workload with a pasted trace (keyspace becomes the number of distinct keys). */
export function withTrace(c: SimConfig, keys: string[], ops: ("r" | "w")[], keyspace: number): SimConfig {
  return { ...c, workload: { ...c.workload, keyspace, missingRatio: 0, segments: [{ fromMs: 0, pattern: { kind: "trace", keys, ops } }] } };
}
export const isTraceWorkload = (c: SimConfig): boolean => c.workload.segments.some((s) => s.pattern.kind === "trace");
