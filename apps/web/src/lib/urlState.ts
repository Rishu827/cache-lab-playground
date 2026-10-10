import { normalizeConfig, type SimConfig } from "@cache-lab/sim-core";
import { getScenario, scenarios } from "@cache-lab/scenarios";

export interface AppState {
  /** Scenario the config started from (null = fully custom). */
  scenarioId: string | null;
  config: SimConfig;
}

const PREFIX = "#v1.";

function toBase64Url(s: string): string {
  const bytes = new TextEncoder().encode(s);
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(s: string): string {
  const bin = atob(s.replace(/-/g, "+").replace(/_/g, "/"));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** The whole config plus seed lives in the hash so a link reproduces the exact run. */
export function encodeState(state: AppState): string {
  return PREFIX + toBase64Url(JSON.stringify({ s: state.scenarioId, c: state.config }));
}

export function decodeState(hash: string): AppState | null {
  if (!hash.startsWith(PREFIX)) return null;
  try {
    const { s, c } = JSON.parse(fromBase64Url(hash.slice(PREFIX.length)));
    if (!c || typeof c !== "object" || !c.workload || !c.cache || !c.origin) return null;
    // Fill in fields added after the link was made so old links keep working.
    return { scenarioId: typeof s === "string" ? s : null, config: normalizeConfig(c) };
  } catch {
    return null;
  }
}

export interface Bootstrap {
  state: AppState;
  embed: boolean;
}

/** Resolve initial state: hash wins, then ?scenario=<id>, then the first scenario. */
export function bootstrap(loc: Pick<Location, "search" | "hash"> = window.location): Bootstrap {
  const params = new URLSearchParams(loc.search);
  const embed = params.get("embed") === "1";
  const fromHash = decodeState(loc.hash);
  if (fromHash) return { state: fromHash, embed };
  const sc = getScenario(params.get("scenario") ?? "") ?? scenarios[0]!;
  return { state: { scenarioId: sc.id, config: structuredClone(sc.config) }, embed };
}
