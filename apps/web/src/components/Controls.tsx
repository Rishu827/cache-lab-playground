import type { ControlId } from "@cache-lab/scenarios";
import type { SimConfig } from "@cache-lab/sim-core";
import { controlDefs, GROUP_ORDER } from "./controlDefs";
import { TraceImport } from "./TraceImport";

interface Props {
  config: SimConfig;
  onChange(c: SimConfig): void;
}

/** Every control, grouped. This is the "full" view. */
export function Controls({ config, onChange }: Props) {
  const defs = controlDefs(config, onChange).filter((d) => d.visible);
  return (
    <div className="controls">
      {GROUP_ORDER.map((g) => {
        const items = defs.filter((d) => d.group === g);
        if (!items.length) return null;
        return (
          <fieldset key={g}>
            <legend>{g}</legend>
            {items.map((d) => (
              <div key={d.id}>{d.node}</div>
            ))}
            {g === "Workload" && <TraceImport config={config} onChange={onChange} />}
          </fieldset>
        );
      })}
    </div>
  );
}

/** Just the few controls a scenario spotlights. This is the "simple" view. */
export function FocusControls({ config, onChange, ids }: Props & { ids: ControlId[] }) {
  const all = controlDefs(config, onChange);
  const shown = ids.map((id) => all.find((d) => d.id === id)).filter((d) => d && d.visible);
  if (!shown.length) return null;
  return (
    <div className="focus-controls">
      {shown.map((d) => (
        <div key={d!.id}>{d!.node}</div>
      ))}
    </div>
  );
}
