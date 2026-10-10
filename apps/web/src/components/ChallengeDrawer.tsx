import type { Summary } from "@cache-lab/sim-core";
import type { Scenario } from "@cache-lab/scenarios";
import { useEffect, useState } from "react";
import type { SimConfig } from "@cache-lab/sim-core";

export function ChallengeDrawer({ scenario, summary, config }: { scenario: Scenario | undefined; summary: Summary; config: SimConfig }) {
  const [hints, setHints] = useState(0);
  useEffect(() => setHints(0), [scenario?.id]);
  if (!scenario) return <p className="muted">Custom setup: pick a scenario to get a challenge.</p>;
  const { challenge } = scenario;
  const result = summary.now > 0 ? challenge.check(summary, config) : undefined;
  return (
    <div className="challenge">
      <p className="goal"><strong>Goal:</strong> {challenge.goal}</p>
      <p className={`status ${result?.pass ? "pass" : "fail"}`} role="status" aria-live="polite">
        {result ? (
          <>
            <span aria-hidden="true">{result.pass ? "✔" : "✖"}</span> {result.pass ? "Passing" : "Not yet"} — {result.detail}
          </>
        ) : (
          "Run the simulation to see your result."
        )}
      </p>
      {challenge.hints.slice(0, hints).map((h, i) => (
        <p key={i} className="hint">💡 {h}</p>
      ))}
      {hints < challenge.hints.length && <button onClick={() => setHints(hints + 1)}>Show hint ({hints}/{challenge.hints.length})</button>}
    </div>
  );
}
