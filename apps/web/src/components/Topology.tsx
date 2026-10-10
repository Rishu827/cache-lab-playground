import type { RequestEvent, Simulation } from "@cache-lab/sim-core";
import type { CSSProperties } from "react";

const W = 560;
const H = 150;
const BOX_Y = 18;
const BOX_H = 114;

interface Col {
  id: string;
  title: string;
}

/** Different shapes per outcome so color is never the only signal. */
function Dot({ e, start, stop }: { e: RequestEvent; start: number; stop: number }) {
  const y = 38 + (e.id % 6) * 14;
  const shape =
    e.outcome === "hit" ? <circle r="5" /> : e.outcome === "miss" ? <path d="M0,-6 L6,5 L-6,5 Z" /> : e.outcome === "error" ? <rect x="-5" y="-5" width="10" height="10" /> : <path d="M0,-6 L6,0 L0,6 L-6,0 Z" />;
  return (
    <g transform={`translate(0 ${y})`}>
      <g className={`dot dot-${e.outcome}`} style={{ "--start": `${start}px`, "--stop": `${stop}px` } as CSSProperties}>
        {shape}
      </g>
    </g>
  );
}

export function Topology({ sim, recent }: { sim: Simulation; recent: RequestEvent[] }) {
  const cols: Col[] = [{ id: "client", title: "Client" }, ...sim.tiers.map((t) => ({ id: t.cfg.name, title: t.cfg.name[0]!.toUpperCase() + t.cfg.name.slice(1) })), { id: "cache", title: "Cache" }, { id: "origin", title: "Origin" }];
  const n = cols.length;
  const boxW = n <= 4 ? 100 : n === 5 ? 90 : 78;
  const step = n > 1 ? (W - boxW - 20) / (n - 1) : 0;
  const x = (i: number) => 10 + i * step;
  const colOf = (id: string) => {
    const i = id === "bloom" ? cols.findIndex((c) => c.id === "cache") : cols.findIndex((c) => c.id === id);
    return i < 0 ? n - 1 : i;
  };
  const q = sim.origin.queueDepth;
  const nodeStats = sim.cache.nodeStats();
  const p = sim.config.protections;
  const badges = [p.bloomBitsPerKey > 0 && "Bloom", p.negativeCacheTtlMs > 0 && "Neg-cache", p.coalescing && "Coalesce", p.lease && "Lease"].filter(Boolean).join(" · ");

  const detail = (c: Col, cx: number) => {
    if (c.id === "client") return <text x={cx} y={BOX_Y + 88} textAnchor="middle" className="sub">t={(sim.now / 1000).toFixed(1)}s</text>;
    if (c.id === "origin")
      return (
        <>
          <text x={cx} y={BOX_Y + 66} textAnchor="middle" className="sub">busy {sim.origin.busy}/{sim.origin.config.concurrency}</text>
          <text x={cx} y={BOX_Y + 82} textAnchor="middle" className="sub">queue {q}</text>
          {sim.origin.isOutage && <text x={cx} y={BOX_Y + 100} textAnchor="middle" className="sub">OUTAGE</text>}
        </>
      );
    if (c.id === "cache") {
      const inner = boxW - 24;
      if (nodeStats.length > 1) {
        const bw = Math.max(4, (inner - (nodeStats.length - 1) * 3) / nodeStats.length);
        return (
          <>
            <text x={cx} y={BOX_Y + 56} textAnchor="middle" className="sub">{nodeStats.length} nodes · {sim.cache.size} entries</text>
            {nodeStats.map((s, i) => {
              const bx = cx - inner / 2 + i * (bw + 3);
              const fill = Math.min(1, s.size / Math.max(1, s.capacity)) * 36;
              return (
                <g key={s.id}>
                  <rect x={bx} y={BOX_Y + 64} width={bw} height={36} className="meter-bg" rx="2" />
                  <rect x={bx} y={BOX_Y + 100 - fill} width={bw} height={fill} className="meter" rx="2" />
                </g>
              );
            })}
          </>
        );
      }
      return (
        <>
          <text x={cx} y={BOX_Y + 62} textAnchor="middle" className="sub">{sim.cache.size}/{sim.cache.config.capacity}</text>
          <rect x={cx - inner / 2} y={BOX_Y + 72} width={inner} height="8" rx="4" className="meter-bg" />
          <rect x={cx - inner / 2} y={BOX_Y + 72} width={(inner * Math.min(100, sim.cache.fillPct)) / 100} height="8" rx="4" className="meter" />
          {badges && <text x={cx} y={BOX_Y + 100} textAnchor="middle" className="sub badge">{badges}</text>}
        </>
      );
    }
    const tier = sim.tiers.find((t) => t.cfg.name === c.id);
    const entries = tier ? [...tier.caches.values()].reduce((a, cc) => a + cc.size, 0) : 0;
    return (
      <>
        <text x={cx} y={BOX_Y + 66} textAnchor="middle" className="sub">{entries} entries</text>
        <text x={cx} y={BOX_Y + 82} textAnchor="middle" className="sub">{tier && tier.cfg.ttlMs > 0 ? `TTL ${tier.cfg.ttlMs / 1000}s` : "no-store"}</text>
      </>
    );
  };

  const label = `${cols.map((c) => c.title).join(" to ")}. Cache ${sim.cache.size} of ${sim.cache.config.capacity} entries. Origin queue depth ${q}.`;
  return (
    <div className="topology">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
        {cols.slice(0, -1).map((c, i) => (
          <line key={c.id} x1={x(i) + boxW} y1={75} x2={x(i + 1)} y2={75} className="wire" />
        ))}
        {cols.map((c, i) => (
          <g key={c.id} className={`node${c.id === "origin" && sim.origin.isOutage ? " outage" : ""}`}>
            <rect x={x(i)} y={BOX_Y} width={boxW} height={BOX_H} rx="8" />
            <text x={x(i) + boxW / 2} y={BOX_Y + 24} textAnchor="middle">{c.title}</text>
            {detail(c, x(i) + boxW / 2)}
          </g>
        ))}
        {recent.slice(-24).map((e) => (
          <Dot key={e.id} e={e} start={x(0) + boxW} stop={Math.max(x(0) + boxW, x(colOf(e.servedBy)) - 4)} />
        ))}
      </svg>
      <ul className="key" aria-label="Legend">
        <li><svg width="14" height="14" aria-hidden="true"><circle cx="7" cy="7" r="5" className="dot-hit" /></svg> served from cache</li>
        <li><svg width="14" height="14" aria-hidden="true"><path d="M7,1 L13,12 L1,12 Z" className="dot-miss" /></svg> went to database</li>
        <li><svg width="14" height="14" aria-hidden="true"><rect x="2" y="2" width="10" height="10" className="dot-error" /></svg> error</li>
        <li><svg width="14" height="14" aria-hidden="true"><path d="M7,1 L13,7 L7,13 L1,7 Z" className="dot-write" /></svg> write</li>
      </ul>
    </div>
  );
}
