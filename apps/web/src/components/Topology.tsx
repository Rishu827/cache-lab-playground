import type { RequestEvent, Simulation } from "@cache-lab/sim-core";

const KIND = { hit: "dot-hit", miss: "dot-miss", error: "dot-error", write: "dot-write" } as const;

/** Different shapes per outcome so color is never the only signal. */
function Dot({ e }: { e: RequestEvent }) {
  const cls = `dot ${KIND[e.outcome]}`;
  const y = 40 + (e.id % 5) * 16;
  const shape =
    e.outcome === "hit" ? <circle r="5" /> : e.outcome === "miss" ? <path d="M0,-6 L6,5 L-6,5 Z" /> : e.outcome === "error" ? <rect x="-5" y="-5" width="10" height="10" /> : <path d="M0,-6 L6,0 L0,6 L-6,0 Z" />;
  return (
    <g transform={`translate(0 ${y})`}>
      <g className={cls}>{shape}</g>
    </g>
  );
}

export function Topology({ sim, recent }: { sim: Simulation; recent: RequestEvent[] }) {
  const q = sim.origin.queueDepth;
  return (
    <div className="topology">
      <svg viewBox="0 0 520 150" role="img" aria-label={`Client to cache to origin. Cache ${sim.cache.size} of ${sim.cache.config.capacity} entries. Origin queue depth ${q}.`}>
        <g className="node">
          <rect x="10" y="20" width="100" height="110" rx="8" />
          <text x="60" y="45" textAnchor="middle">Client</text>
          <text x="60" y="110" textAnchor="middle" className="sub">t={(sim.now / 1000).toFixed(1)}s</text>
        </g>
        <g className="node">
          <rect x="210" y="20" width="100" height="110" rx="8" />
          <text x="260" y="45" textAnchor="middle">Cache</text>
          <text x="260" y="95" textAnchor="middle" className="sub">{sim.cache.size}/{sim.cache.config.capacity}</text>
          <rect x="226" y="105" width="68" height="8" rx="4" className="meter-bg" />
          <rect x="226" y="105" width={(68 * Math.min(100, sim.cache.fillPct)) / 100} height="8" rx="4" className="meter" />
        </g>
        <g className={`node ${sim.origin.isOutage ? "outage" : ""}`}>
          <rect x="410" y="20" width="100" height="110" rx="8" />
          <text x="460" y="45" textAnchor="middle">Origin</text>
          <text x="460" y="85" textAnchor="middle" className="sub">busy {sim.origin.busy}/{sim.origin.config.concurrency}</text>
          <text x="460" y="102" textAnchor="middle" className="sub">queue {q}</text>
          {sim.origin.isOutage && <text x="460" y="120" textAnchor="middle" className="sub">OUTAGE</text>}
        </g>
        <line x1="110" y1="75" x2="210" y2="75" className="wire" />
        <line x1="310" y1="75" x2="410" y2="75" className="wire" />
        {recent.slice(-24).map((e) => (
          <Dot key={e.id} e={e} />
        ))}
      </svg>
      <ul className="key" aria-label="Legend">
        <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" className="dot-hit" /></svg> hit</li>
        <li><svg width="14" height="14" aria-hidden="true"><path d="M7,1 L13,12 L1,12 Z" className="dot-miss" /></svg> miss</li>
        <li><svg width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" className="dot-error" /></svg> error</li>
        <li><svg width="14" height="14" aria-hidden="true"><path d="M7,1 L13,7 L7,13 L1,7 Z" className="dot-write" /></svg> write</li>
      </ul>
    </div>
  );
}
