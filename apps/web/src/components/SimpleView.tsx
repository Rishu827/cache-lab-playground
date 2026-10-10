import type { Scenario } from "@cache-lab/scenarios";
import type { SimConfig, Summary } from "@cache-lab/sim-core";
import { useState } from "react";
import { narrate } from "../lib/narrate";
import type { SimView } from "../lib/useSimulation";
import { Actions } from "./Actions";
import { ChallengeDrawer } from "./ChallengeDrawer";
import { Chart } from "./Chart";
import { FocusControls } from "./Controls";
import { EventLog } from "./EventLog";
import { Inspector } from "./Inspector";
import { Topology } from "./Topology";
import { Transport } from "./Transport";

type Metric = "hit" | "latency" | "load" | "stale";
const METRICS: { id: Metric; label: string }[] = [
  { id: "hit", label: "Hit ratio" },
  { id: "latency", label: "Latency" },
  { id: "load", label: "Database load" },
  { id: "stale", label: "Stale reads" },
];

function OneChart({ summary, windowMs }: { summary: Summary; windowMs: number }) {
  const [metric, setMetric] = useState<Metric>("hit");
  const w = summary.windows;
  const col = (k: keyof Summary["windows"][number]) => w.map((x) => x[k] as number);
  return (
    <div className="one-chart">
      <div className="chips" role="group" aria-label="Chart metric">
        {METRICS.map((m) => (
          <button key={m.id} aria-pressed={metric === m.id} onClick={() => setMetric(m.id)}>
            {m.label}
          </button>
        ))}
      </div>
      {metric === "hit" && <Chart title="Share of reads served without the database" series={[{ label: "per second", values: col("hitRatio"), color: "var(--c1)" }]} windowMs={windowMs} yMax={1} format={(v) => `${(v * 100).toFixed(0)}%`} />}
      {metric === "latency" && (
        <Chart
          title="Request latency (ms)"
          series={[
            { label: "typical (p50)", values: col("p50"), color: "var(--c1)" },
            { label: "slowest 5% (p95)", values: col("p95"), color: "var(--c2)", dash: "6 3" },
          ]}
          windowMs={windowMs}
        />
      )}
      {metric === "load" && <Chart title="Requests reaching the database (per second)" series={[{ label: "database", values: col("originQps"), color: "var(--c2)" }]} windowMs={windowMs} />}
      {metric === "stale" && <Chart title="Out-of-date reads per second" kind="bar" series={[{ label: "stale", values: col("staleReads"), color: "var(--bad)" }]} windowMs={windowMs} />}
    </div>
  );
}

interface Props {
  scenario: Scenario | undefined;
  config: SimConfig;
  onChange(c: SimConfig): void;
  view: SimView;
  onShowFull(): void;
}

/** One screen, one story: what's happening, how it's going, and the few knobs that matter. */
export function SimpleView({ scenario, config, onChange, view, onShowFull }: Props) {
  const { summary: s, sim } = view;
  const n = narrate(s);
  return (
    <div className="simple">
      <section className="panel hero" aria-label="Challenge">
        <ChallengeDrawer scenario={scenario} summary={s} config={config} />
      </section>

      <section className="panel" aria-label="Simulation">
        <Transport view={view} seed={config.seed} onSeed={() => {}} durationMs={config.durationMs} compact />
        <Topology sim={sim} recent={view.recent} />
        <div className="narration" aria-live="polite">
          {n.lines.map((l) => (
            <p key={l}>{l}</p>
          ))}
          {n.warnings.map((w) => (
            <p key={w} className="warn">⚠ {w}</p>
          ))}
        </div>
        <dl className="stats big">
          <div><dt>Served without database</dt><dd>{(s.hitRatio * 100).toFixed(0)}%</dd></div>
          <div><dt>Typical latency</dt><dd>{s.p50 < 10 ? s.p50.toFixed(1) : s.p50.toFixed(0)} ms</dd></div>
          <div><dt>Database queue</dt><dd>{sim.origin.queueDepth}</dd></div>
        </dl>
      </section>

      <section className="panel" aria-label="Try changing">
        <h2>Try changing</h2>
        <FocusControls config={config} onChange={onChange} ids={scenario?.focus ?? ["capacity", "ttl", "policy"]} />
        <p className="muted">Changing a setting restarts the run so you can compare cleanly.</p>
        <button className="link" onClick={onShowFull}>Show all controls →</button>
      </section>

      <section className="panel" aria-label="Chart">
        <h2>How it's going</h2>
        <OneChart summary={s} windowMs={config.windowMs} />
      </section>

      <details className="panel">
        <summary>Break something</summary>
        <Actions config={config} onInject={view.inject} />
      </details>
      <details className="panel">
        <summary>Under the hood: cache contents and request log</summary>
        <div className="under-hood">
          <Inspector sim={sim} />
          <EventLog sim={sim} />
        </div>
      </details>
    </div>
  );
}
