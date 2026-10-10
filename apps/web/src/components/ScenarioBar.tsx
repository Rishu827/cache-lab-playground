import { scenarios, type Scenario } from "@cache-lab/scenarios";

interface Props {
  scenario: Scenario | undefined;
  onPick(id: string): void;
}

export function ScenarioBar({ scenario, onPick }: Props) {
  return (
    <div className="scenario-bar">
      <label className="inline">
        Scenario
        <select value={scenario?.id ?? ""} onChange={(e) => onPick(e.target.value)}>
          {!scenario && <option value="">Custom</option>}
          {scenarios.map((s) => (
            <option key={s.id} value={s.id}>
              Article {s.article}: {s.title}
            </option>
          ))}
        </select>
      </label>
      <p className="desc">
        {scenario ? scenario.description : "Custom configuration."}
        {scenario?.articleUrl && (
          <>
            {" "}
            <a href={scenario.articleUrl} target="_blank" rel="noreferrer">Read the article</a>
          </>
        )}
      </p>
    </div>
  );
}
