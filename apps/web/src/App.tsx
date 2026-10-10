import { getScenario } from "@cache-lab/scenarios";
import type { SimConfig } from "@cache-lab/sim-core";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { ChallengeDrawer } from "./components/ChallengeDrawer";
import { ChartsPanel } from "./components/ChartsPanel";
import { Actions } from "./components/Actions";
import { Controls } from "./components/Controls";
import { EventLog } from "./components/EventLog";
import { Inspector } from "./components/Inspector";
import { ScenarioBar } from "./components/ScenarioBar";
import { SimpleView } from "./components/SimpleView";
import { Topology } from "./components/Topology";
import { Transport } from "./components/Transport";
import { bootstrap, encodeState, saveView, type ViewMode } from "./lib/urlState";
import { useSimulation } from "./lib/useSimulation";

type Tab = "run" | "controls" | "charts" | "inspect";
const TABS: { id: Tab; label: string }[] = [
  { id: "run", label: "Run" },
  { id: "controls", label: "Controls" },
  { id: "charts", label: "Charts" },
  { id: "inspect", label: "Cache & log" },
];

function Panel({ tab, active, title, children, className = "" }: { tab: Tab; active: Tab; title: string; children: ReactNode; className?: string }) {
  return (
    <section className={`panel ${className}`} data-tab={tab} data-active={tab === active} aria-label={title}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

export function App() {
  const initial = useMemo(() => bootstrap(), []);
  const [scenarioId, setScenarioId] = useState(initial.state.scenarioId);
  const [config, setConfig] = useState<SimConfig>(initial.state.config);
  const [tab, setTab] = useState<Tab>("run");
  const [reduceMotion, setReduceMotion] = useState(false);
  const [copied, setCopied] = useState(false);
  const embed = initial.embed;
  const [mode, setMode] = useState<ViewMode>(initial.view);
  const chooseMode = (m: ViewMode) => {
    setMode(m);
    saveView(m);
  };

  const view = useSimulation(config);
  const scenario = scenarioId ? getScenario(scenarioId) : undefined;

  // The whole config lives in the URL hash so any state can be shared.
  useEffect(() => {
    const id = setTimeout(() => history.replaceState(null, "", encodeState({ scenarioId, config })), 250);
    return () => clearTimeout(id);
  }, [scenarioId, config]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (e.code !== "Space" || /^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(t.tagName)) return;
      e.preventDefault();
      if (view.playing) view.pause();
      else view.play();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view]);

  const edit = (c: SimConfig) => {
    setConfig(c);
  };
  const pickScenario = (id: string) => {
    const s = getScenario(id);
    if (!s) return;
    setScenarioId(id);
    setConfig(structuredClone(s.config));
  };
  const share = async () => {
    const url = `${location.origin}${location.pathname}${encodeState({ scenarioId, config })}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      prompt("Copy this link:", url);
    }
  };

  return (
    <div className={`app${embed ? " embed" : ""}`} data-reduce-motion={reduceMotion}>
      {!embed && (
        <header className="top">
          <h1>Cache Lab</h1>
          <ScenarioBar scenario={scenario} onPick={pickScenario} />
          <div className="top-actions">
            <div className="seg" role="group" aria-label="View">
              <button aria-pressed={mode === "simple"} onClick={() => chooseMode("simple")}>Simple</button>
              <button aria-pressed={mode === "full"} onClick={() => chooseMode("full")}>Full</button>
            </div>
            <label className="check">
              <input type="checkbox" checked={reduceMotion} onChange={(e) => setReduceMotion(e.target.checked)} /> Reduce motion
            </label>
            <button onClick={share}>{copied ? "Link copied" : "Share link"}</button>
          </div>
        </header>
      )}
      {embed && scenario && <p className="embed-title">{scenario.title}</p>}

      {mode === "simple" ? (
        <SimpleView scenario={scenario} config={config} onChange={edit} view={view} onShowFull={() => chooseMode("full")} />
      ) : (
        <>
          <nav className="tabs" role="tablist" aria-label="Panels">
            {TABS.map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}>
                {t.label}
              </button>
            ))}
          </nav>

          <main className="grid">
            <Panel tab="run" active={tab} title="Simulation" className="area-run">
              <Transport view={view} seed={config.seed} onSeed={(n) => edit({ ...config, seed: n })} durationMs={config.durationMs} />
              <Topology sim={view.sim} recent={view.recent} />
              <ChallengeDrawer scenario={scenario} summary={view.summary} config={config} />
              <Stats summary={view.summary} />
            </Panel>
            <Panel tab="controls" active={tab} title="Controls" className="area-controls">
              <Controls config={config} onChange={edit} />
              <fieldset className="actions-box">
                <legend>Failure injection (now)</legend>
                <Actions config={config} onInject={view.inject} />
              </fieldset>
            </Panel>
            <Panel tab="charts" active={tab} title="Charts" className="area-charts">
              <ChartsPanel summary={view.summary} windowMs={config.windowMs} />
            </Panel>
            <Panel tab="inspect" active={tab} title="Cache inspector" className="area-inspect">
              <Inspector sim={view.sim} />
            </Panel>
            <Panel tab="inspect" active={tab} title="Event log" className="area-log">
              <EventLog sim={view.sim} />
            </Panel>
          </main>
        </>
      )}
    </div>
  );
}

function Stats({ summary: s }: { summary: ReturnType<typeof useSimulation>["summary"] }) {
  const items: [string, string][] = [
    ["Hit ratio", `${(s.hitRatio * 100).toFixed(1)}%`],
    ["p95", `${s.p95.toFixed(0)} ms`],
    ["Origin load", `${s.originRequests}`],
    ["Evictions", `${s.evictions}`],
    ["Stale reads", `${s.staleReads}`],
    ["Errors", `${s.errors}`],
    ["Lost writes", `${s.lostWrites}`],
  ];
  return (
    <dl className="stats">
      {items.map(([k, v]) => (
        <div key={k}>
          <dt>{k}</dt>
          <dd>{v}</dd>
        </div>
      ))}
    </dl>
  );
}
