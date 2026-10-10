import type { SimConfig, Summary } from "@cache-lab/sim-core";

export interface ChallengeResult {
  pass: boolean;
  /** One line explaining the current state, e.g. "p95 = 62ms (need < 50ms)". */
  detail: string;
}

export interface Challenge {
  goal: string;
  hints: string[];
  /** Evaluated against the run summary and the config the learner ended up with. */
  check(summary: Summary, config: SimConfig): ChallengeResult;
}

/** A scenario is pure data: a starting config plus a challenge predicate. No engine changes needed. */
export interface Scenario {
  id: string;
  article: number;
  title: string;
  description: string;
  articleUrl?: string;
  config: SimConfig;
  challenge: Challenge;
}
