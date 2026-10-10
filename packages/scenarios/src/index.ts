import { latencyLadder } from "./scenarios/01-latency-ladder";
import { strategies } from "./scenarios/02-strategies";
import { scanResistance } from "./scenarios/03-scan-resistance";
import { staleReads } from "./scenarios/04-stale-reads";
import { stampede } from "./scenarios/06-stampede";
import { capstone } from "./scenarios/08-capstone";
import type { Scenario } from "./types";

export * from "./types";
export * from "./helpers";

/** Registered scenarios. Articles 5 (layers) and 7 (cluster) arrive with the v2 engine features. */
export const scenarios: Scenario[] = [latencyLadder, strategies, scanResistance, staleReads, stampede, capstone];

export const getScenario = (id: string): Scenario | undefined => scenarios.find((s) => s.id === id);
