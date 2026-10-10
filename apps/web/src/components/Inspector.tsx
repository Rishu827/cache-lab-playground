import { baseKey, type Simulation } from "@cache-lab/sim-core";
import { useState } from "react";

const ROWS = 60;

export function Inspector({ sim }: { sim: Simulation }) {
  const [tier, setTier] = useState("cache");
  const now = sim.now;
  const layer = sim.tiers.find((t) => t.cfg.name === tier);
  const source = layer ? (layer.caches.get(0) ?? [...layer.caches.values()][0]) : sim.cache;
  const entries = (source?.snapshot() ?? []).sort((a, b) => b.hits - a.hits || a.key.localeCompare(b.key, undefined, { numeric: true }));
  const shown = entries.slice(0, ROWS);
  return (
    <div className="inspector">
      {sim.tiers.length > 0 && (
        <label className="inline">
          Show
          <select value={tier} onChange={(e) => setTier(e.target.value)}>
            <option value="cache">Cache</option>
            {sim.tiers.map((t) => (
              <option key={t.cfg.name} value={t.cfg.name}>
                {t.cfg.name}{t.cfg.shared ? "" : " (client 0)"}
              </option>
            ))}
          </select>
        </label>
      )}
      <div className="scroll">
        <table>
          <caption className="sr-only">Cache entries, most-hit first</caption>
          <thead>
            <tr>
              <th scope="col">Key</th>
              <th scope="col">Ver</th>
              <th scope="col">Age</th>
              <th scope="col">TTL left</th>
              <th scope="col">Hits</th>
              <th scope="col">State</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((e) => {
              const ttl = e.expiresAt === Infinity ? null : e.expiresAt - now;
              const notFound = e.version < 0;
              const stale = !notFound && e.version < sim.latestVersion(baseKey(e.key));
              const expired = ttl !== null && ttl <= 0;
              const state = [notFound && "∅ not found", stale && "▲ stale", expired && "⏱ expired", e.dirty && "● dirty", e.tag && `#${e.tag}`].filter(Boolean).join(" ") || "ok";
              return (
                <tr key={e.key} className={stale ? "row-stale" : expired ? "row-expired" : ""}>
                  <th scope="row">{e.key}</th>
                  <td>{notFound ? "–" : `v${e.version}`}</td>
                  <td>{((now - e.storedAt) / 1000).toFixed(1)}s</td>
                  <td>{ttl === null ? "∞" : `${Math.max(0, ttl / 1000).toFixed(1)}s`}</td>
                  <td>{e.hits}</td>
                  <td>{state}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {entries.length === 0 && <p className="muted">Empty.</p>}
        {entries.length > ROWS && <p className="muted">+{entries.length - ROWS} more entries</p>}
      </div>
      {!layer && sim.cache.recentEvictions.length > 0 && (
        <p className="evicted">
          Recently evicted: {sim.cache.recentEvictions.slice(-12).map((k, i) => <s key={`${k}${i}`}>{k} </s>)}
        </p>
      )}
    </div>
  );
}
