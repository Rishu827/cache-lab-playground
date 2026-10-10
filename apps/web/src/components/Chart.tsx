import { useId } from "react";

export interface Series {
  label: string;
  /** One value per window. */
  values: number[];
  /** CSS color token, e.g. "var(--c1)". Dash pattern is a second, non-color cue. */
  color: string;
  dash?: string;
}

interface Props {
  title: string;
  series: Series[];
  windowMs: number;
  unit?: string;
  kind?: "line" | "bar";
  /** Fixed y range, e.g. [0, 1] for ratios. */
  yMax?: number;
  format?: (v: number) => string;
}

const W = 320;
const H = 130;
const PAD = { l: 38, r: 8, t: 8, b: 18 };

export function Chart({ title, series, windowMs, kind = "line", yMax, format = (v) => v.toFixed(0) }: Props) {
  const id = useId();
  const n = Math.max(...series.map((s) => s.values.length), 0);
  const max = yMax ?? Math.max(1, ...series.flatMap((s) => s.values)) * 1.1;
  const x = (i: number) => PAD.l + (n <= 1 ? 0 : (i / (n - 1)) * (W - PAD.l - PAD.r));
  const y = (v: number) => PAD.t + (1 - Math.min(v, max) / max) * (H - PAD.t - PAD.b);
  const barW = Math.max(1, (W - PAD.l - PAD.r) / Math.max(n, 1) - 1);
  const last = series.map((s) => `${s.label}: ${s.values.length ? format(s.values[s.values.length - 1]!) : "–"}`).join(", ");

  return (
    <figure className="chart" aria-labelledby={id}>
      <figcaption id={id}>
        <strong>{title}</strong>
        <span className="legend">
          {series.map((s) => (
            <span key={s.label} className="legend-item">
              <svg width="18" height="8" aria-hidden="true">
                <line x1="0" y1="4" x2="18" y2="4" stroke={s.color} strokeWidth="2.5" strokeDasharray={s.dash} />
              </svg>
              {s.label}
            </span>
          ))}
        </span>
      </figcaption>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}. Latest ${last}`}>
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} className="grid" />
            <text x={PAD.l - 4} y={y(max * f) + 3} textAnchor="end" className="tick">
              {format(max * f)}
            </text>
          </g>
        ))}
        <text x={PAD.l} y={H - 4} className="tick">
          0s
        </text>
        <text x={W - PAD.r} y={H - 4} textAnchor="end" className="tick">
          {((n * windowMs) / 1000).toFixed(0)}s
        </text>
        {kind === "line"
          ? series.map((s) => (
              <polyline key={s.label} fill="none" stroke={s.color} strokeWidth="1.8" strokeDasharray={s.dash} points={s.values.map((v, i) => `${x(i)},${y(v)}`).join(" ")} />
            ))
          : series.map((s) =>
              s.values.map((v, i) =>
                v > 0 ? <rect key={`${s.label}${i}`} x={x(i) - barW / 2} y={y(v)} width={barW} height={y(0) - y(v)} fill={s.color} /> : null,
              ),
            )}
      </svg>
    </figure>
  );
}
