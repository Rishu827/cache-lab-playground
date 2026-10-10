import type { Simulation } from "@cache-lab/sim-core";

const ROWS = 60;

export function Inspector({ sim }: { sim: Simulation }) {
  const now = sim.now;
  const entries = sim.cache.snapshot().sort((a, b) => b.hits - a.hits || a.key.localeCompare(b.key, undefined, { numeric: true }));
  const shown = entries.slice(0, ROWS);
  return (
    <div className="inspector">
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
              const stale = e.version < sim.latestVersion(e.key);
              const expired = ttl !== null && ttl <= 0;
              const state = [stale && "▲ stale", expired && "⏱ expired", e.dirty && "● dirty"].filter(Boolean).join(" ") || "ok";
              return (
                <tr key={e.key} className={stale ? "row-stale" : expired ? "row-expired" : ""}>
                  <th scope="row">{e.key}</th>
                  <td>v{e.version}</td>
                  <td>{((now - e.storedAt) / 1000).toFixed(1)}s</td>
                  <td>{ttl === null ? "∞" : `${Math.max(0, ttl / 1000).toFixed(1)}s`}</td>
                  <td>{e.hits}</td>
                  <td>{state}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {entries.length === 0 && <p className="muted">Cache is empty.</p>}
        {entries.length > ROWS && <p className="muted">+{entries.length - ROWS} more entries</p>}
      </div>
      {sim.cache.recentEvictions.length > 0 && (
        <p className="evicted">
          Recently evicted: {sim.cache.recentEvictions.slice(-12).map((k, i) => <s key={`${k}${i}`}>{k} </s>)}
        </p>
      )}
    </div>
  );
}
