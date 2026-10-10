import type { Action, SimConfig } from "@cache-lab/sim-core";

interface Props {
  config: SimConfig;
  onInject(a: Action): void;
}

/** Failure injection and one-off events. Only shows what makes sense for the current setup. */
export function Actions({ config: c, onInject }: Props) {
  const hasLayers = c.layers.length > 0;
  const btn = (label: string, a: Action) => (
    <button key={label} onClick={() => onInject(a)}>
      {label}
    </button>
  );
  return (
    <div>
      <div className="btn-row">
        {btn("Expire hot key", { kind: "expireHotKey" })}
        {btn("Flush cache", { kind: "flushCache" })}
        {c.strategy === "write-behind" && btn("Crash write-behind buffer", { kind: "crashWriteBehind" })}
        {btn("Database outage (5s)", { kind: "originOutage", durationMs: 5000 })}
        {btn("Database 5× slower (5s)", { kind: "originSlowdown", factor: 5, durationMs: 5000 })}
        {hasLayers && btn("Deploy new version", { kind: "deploy" })}
        {hasLayers && btn("Purge CDN", { kind: "purgeShared" })}
        {c.invalidation.tagGroups > 0 && btn("Invalidate tag g0", { kind: "invalidateTag", tag: "g0" })}
        {btn("Add cache node", { kind: "addNode" })}
        {c.cluster.nodes > 1 && btn("Remove cache node", { kind: "removeNode" })}
      </div>
      <p className="muted">These act on the live run and are not saved in the page URL. Scenario events (like the t=20s flush) are.</p>
    </div>
  );
}
