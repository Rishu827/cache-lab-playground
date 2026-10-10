import type { Simulation } from "@cache-lab/sim-core";
import { useState } from "react";

const SHOWN = 150;
const MARK = { hit: "✓", miss: "↻", error: "✗", write: "✎" } as const;

export function EventLog({ sim }: { sim: Simulation }) {
  const [filter, setFilter] = useState("");
  const f = filter.trim().toLowerCase();
  const lines = (f ? sim.log.filter((e) => e.key.toLowerCase() === f || e.key.toLowerCase().includes(f)) : sim.log).slice(-SHOWN).reverse();
  return (
    <div className="eventlog">
      <label className="inline">
        Filter by key
        <input type="search" value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="e.g. k0" />
      </label>
      <ol className="lines" aria-label="Request trace, newest first">
        {lines.map((e) => (
          <li key={e.id} className={`ev-${e.outcome}${e.stale ? " ev-stale" : ""}`}>
            <span aria-hidden="true">{MARK[e.outcome]}</span> {e.line}
          </li>
        ))}
      </ol>
      {lines.length === 0 && <p className="muted">No requests yet. Press play or step.</p>}
    </div>
  );
}
