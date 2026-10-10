# Authoring a scenario

A scenario is data: a starting `SimConfig` plus a challenge predicate. Adding one needs no engine changes.

1. Create `packages/scenarios/src/scenarios/NN-name.ts` exporting a `Scenario`:

   ```ts
   import { defaultConfig } from "@cache-lab/sim-core";
   import type { Scenario } from "../types";

   export const myScenario: Scenario = {
     id: "my-scenario",          // used in ?scenario=my-scenario
     article: 9,
     title: "Short title",
     description: "One or two sentences shown in the scenario bar.",
     articleUrl: "https://example.com/article",   // optional
     config: defaultConfig({ /* overrides */ }),
     challenge: {
       goal: "What the learner must achieve.",
       hints: ["Nudge first", "Stronger nudge second"],
       check: (summary, config) => ({ pass: summary.p95 < 50, detail: `p95 = ${summary.p95.toFixed(0)}ms` }),
     },
   };
   ```

2. Register it in `packages/scenarios/src/index.ts`.
3. Add a "solution" (and ideally a plausible wrong fix)  for it in `packages/scenarios/test/scenarios.test.ts`. The suite checks that a scenario **fails at its starting config**, **passes with the solution**, and is **deterministic**.

## Tips

- Windowed checks (`summary.windows`) need the run to have passed the relevant time; return a "run past t=…" message and `pass: false` until then.
- Scheduled failures go in `config.events` (e.g. `{ atMs: 20000, action: { kind: "flushCache" } }`) so the scenario is repeatable and shareable.
- Segments (`workload.segments`) switch the traffic pattern at a given time; use `{ kind: "mix" }` to run, say, a scan alongside Zipf traffic.
- Check the challenge is reachable with a given budget: hit-ratio ceilings and latency floors come from the workload, not the cache.

## Golden files

`packages/scenarios/test/golden.test.ts` snapshots a digest of every scenario run into `test/golden/<id>.json`. Adding a scenario creates its file on the next test run; commit it. After an intentional engine change, run `npx vitest run -u` and review the JSON diff.

## Features you can use in a scenario

`workload.clients`, `workload.missingRatio`, `layers` (browser/CDN), `cluster`, `invalidation` (tags, versioned keys), `protections` (negative cache, Bloom, lease), and scheduled actions such as `deploy`, `purgeShared`, `addNode`, `removeNode`, `invalidateTag`.

The in-app Docs page lists every scenario automatically from the registry, so a new scenario appears there with its goal and hints with no extra work.
