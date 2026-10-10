import type { Summary } from "@cache-lab/sim-core";
import { Chart } from "./Chart";

export function ChartsPanel({ summary, windowMs }: { summary: Summary; windowMs: number }) {
  const w = summary.windows;
  const col = <K extends keyof Summary["windows"][number]>(k: K) => w.map((x) => x[k] as number);
  return (
    <div className="charts">
      <Chart title="Hit ratio" series={[{ label: "per window", values: col("hitRatio"), color: "var(--c1)" }]} windowMs={windowMs} yMax={1} format={(v) => `${(v * 100).toFixed(0)}%`} />
      <Chart
        title="Latency (ms)"
        series={[
          { label: "p50", values: col("p50"), color: "var(--c1)" },
          { label: "p95", values: col("p95"), color: "var(--c2)", dash: "6 3" },
          { label: "p99", values: col("p99"), color: "var(--c3)", dash: "2 3" },
        ]}
        windowMs={windowMs}
      />
      <Chart title="Origin load (req/s)" series={[{ label: "QPS", values: col("originQps"), color: "var(--c2)" }]} windowMs={windowMs} />
      <Chart title="Origin queue depth (max)" series={[{ label: "queue", values: col("maxQueueDepth"), color: "var(--c3)" }]} windowMs={windowMs} />
      <Chart title="Stale reads per window" kind="bar" series={[{ label: "stale", values: col("staleReads"), color: "var(--bad)" }]} windowMs={windowMs} />
      <Chart title="Cache fill" series={[{ label: "fill", values: col("fillPct"), color: "var(--c1)" }]} windowMs={windowMs} yMax={100} format={(v) => `${v.toFixed(0)}%`} />
    </div>
  );
}
