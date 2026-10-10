import type { Action, PolicyName, SimConfig, StrategyName } from "@cache-lab/sim-core";
import type { ReactNode } from "react";
import { getSkew, setSkew, withCache, withOrigin, withProtections, withWorkload } from "../lib/configEdit";

interface Props {
  config: SimConfig;
  onChange(c: SimConfig): void;
  onInject(a: Action): void;
}

const POLICIES: PolicyName[] = ["fifo", "lru", "lfu", "random", "tinylfu"];
const STRATEGIES: StrategyName[] = ["cache-aside", "read-through", "write-through", "write-behind", "write-around"];

function Num({ label, value, min, max, step = 1, suffix = "", onChange }: { label: string; value: number; min: number; max: number; step?: number; suffix?: string; onChange(n: number): void }) {
  return (
    <label className="field">
      <span>
        {label} <output>{value}{suffix}</output>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} />
    </label>
  );
}

function Select<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: T[]; onChange(v: T): void }) {
  return (
    <label className="field">
      <span>{label}</span>
      <select value={value} onChange={(e) => onChange(e.target.value as T)}>
        {options.map((o) => (
          <option key={o}>{o}</option>
        ))}
      </select>
    </label>
  );
}

const Group = ({ title, children }: { title: string; children: ReactNode }) => (
  <fieldset>
    <legend>{title}</legend>
    {children}
  </fieldset>
);

export function Controls({ config: c, onChange, onInject }: Props) {
  const skew = getSkew(c);
  return (
    <div className="controls">
      <Group title="Workload">
        <Num label="Rate" value={c.workload.ratePerSec} min={10} max={1000} step={10} suffix="/s" onChange={(n) => onChange(withWorkload(c, { ratePerSec: n }))} />
        <Num label="Read ratio" value={Math.round(c.workload.readRatio * 100)} min={0} max={100} suffix="%" onChange={(n) => onChange(withWorkload(c, { readRatio: n / 100 }))} />
        <Num label="Keyspace" value={c.workload.keyspace} min={10} max={5000} step={10} onChange={(n) => onChange(withWorkload(c, { keyspace: n }))} />
        {skew !== undefined && <Num label="Zipf skew" value={skew} min={0.5} max={2} step={0.1} onChange={(n) => onChange(setSkew(c, Math.round(n * 10) / 10))} />}
      </Group>
      <Group title="Cache">
        <Num label="Capacity" value={c.cache.capacity} min={0} max={1000} step={5} suffix=" entries" onChange={(n) => onChange(withCache(c, { capacity: n }))} />
        <Num label="TTL" value={c.cache.ttlMs / 1000} min={0} max={120} suffix="s (0 = none)" onChange={(n) => onChange(withCache(c, { ttlMs: n * 1000 }))} />
        <Select label="Eviction policy" value={c.cache.policy} options={POLICIES} onChange={(v) => onChange(withCache(c, { policy: v }))} />
        <Select label="Write strategy" value={c.strategy} options={STRATEGIES} onChange={(v) => onChange({ ...c, strategy: v })} />
        {c.strategy === "write-behind" && <Num label="Flush interval" value={c.writeBehindFlushMs / 1000} min={0.5} max={10} step={0.5} suffix="s" onChange={(n) => onChange({ ...c, writeBehindFlushMs: n * 1000 })} />}
      </Group>
      <Group title="Origin (database)">
        <Num label="Latency" value={c.origin.latencyMs} min={5} max={500} step={5} suffix="ms" onChange={(n) => onChange(withOrigin(c, { latencyMs: n }))} />
        <Num label="Concurrency" value={c.origin.concurrency} min={1} max={100} onChange={(n) => onChange(withOrigin(c, { concurrency: n }))} />
        <Num label="Failure rate" value={Math.round(c.origin.failureRate * 100)} min={0} max={50} suffix="%" onChange={(n) => onChange(withOrigin(c, { failureRate: n / 100 }))} />
      </Group>
      <Group title="Protections">
        <label className="check">
          <input type="checkbox" checked={c.protections.coalescing} onChange={(e) => onChange(withProtections(c, { coalescing: e.target.checked }))} /> Request coalescing
        </label>
        <Num label="TTL jitter" value={Math.round(c.protections.ttlJitter * 100)} min={0} max={50} suffix="%" onChange={(n) => onChange(withProtections(c, { ttlJitter: n / 100 }))} />
        <Num label="Stale-while-revalidate" value={c.protections.staleWhileRevalidateMs / 1000} min={0} max={30} suffix="s" onChange={(n) => onChange(withProtections(c, { staleWhileRevalidateMs: n * 1000 }))} />
      </Group>
      <Group title="Failure injection (now)">
        <div className="btn-row">
          <button onClick={() => onInject({ kind: "expireHotKey" })}>Expire hot key</button>
          <button onClick={() => onInject({ kind: "flushCache" })}>Flush cache</button>
          <button onClick={() => onInject({ kind: "crashWriteBehind" })}>Crash write-behind buffer</button>
          <button onClick={() => onInject({ kind: "originOutage", durationMs: 5000 })}>Origin outage 5s</button>
          <button onClick={() => onInject({ kind: "originSlowdown", factor: 5, durationMs: 5000 })}>Origin 5× slower 5s</button>
        </div>
        <p className="muted">Injected actions are not stored in the share link. Use scheduled events in a scenario for repeatable runs.</p>
      </Group>
    </div>
  );
}
