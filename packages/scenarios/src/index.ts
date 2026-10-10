import { latencyLadder } from "./scenarios/01-latency-ladder";
import { strategies } from "./scenarios/02-strategies";
import { scanResistance } from "./scenarios/03-scan-resistance";
import { staleReads } from "./scenarios/04-stale-reads";
import { layersDeploy } from "./scenarios/05-layers-deploy";
import { stampede } from "./scenarios/06-stampede";
import { penetration } from "./scenarios/06b-penetration";
import { clusterResize } from "./scenarios/07-cluster-resize";
import { capstone } from "./scenarios/08-capstone";
import type { Scenario } from "./types";

export * from "./types";
export * from "./helpers";

/** Registered scenarios, in article order. */
export const scenarios: Scenario[] = [latencyLadder, strategies, scanResistance, staleReads, layersDeploy, stampede, penetration, clusterResize, capstone];

export const getScenario = (id: string): Scenario | undefined => scenarios.find((s) => s.id === id);
