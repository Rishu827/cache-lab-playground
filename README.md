# Cache Lab

An interactive, in-browser cache simulator. Run a request workload against a configurable cache stack and watch what happens.

- **Learn by doing** — every article links to a scenario preset and a challenge.
- **Deterministic and shareable** — the same config produces the same run, and the whole config lives in the URL.
- **Zero backend** — static site, free to host, embeddable via iframe.

> Status: v1 in progress. Full plan in [docs/spec.md](docs/spec.md); authoring guide in [docs/scenario-authoring.md](docs/scenario-authoring.md).

## Planned layout

```
packages/sim-core/   engine, components, strategies, policies, metrics
packages/scenarios/  scenario definitions + challenge checks
apps/web/            React UI
docs/                spec, scenario authoring guide
```

## Develop

```
npm install
npm run dev          # web app at http://localhost:5173
npm test             # sim-core + scenarios (Vitest)
npm run test:e2e     # Playwright smoke tests (npx playwright install chromium first)
npm run typecheck
npm run build        # static build in apps/web/dist
```

URL parameters: `?scenario=<id>` picks a preset, `?embed=1` hides the chrome for iframes. All config and the seed are stored in the URL hash, so any link reproduces the exact run.

## Views

- **Simple** (default): one story per scenario. The goal, the topology, a plain-English summary, three headline numbers, only the 2-4 controls the scenario spotlights, and one chart you can switch between metrics. Failure injection and the cache/log inspectors are tucked into collapsible sections.
- **Full**: every control, six charts, inspector, event log, seed and single-step. Toggle in the header, or open with `?view=full`.

## What's in the engine

- Discrete-event core with a seeded PRNG: same config + seed = identical run.
- Workloads: uniform, Zipf, scan, hot-key, mixes, bursts via segments, nonexistent-key traffic, and trace replay (paste or upload).
- Caches: FIFO, LRU, LFU, Random, TinyLFU; TTL; browser and CDN layers; N-node cluster with modulo or consistent-hash routing and add/remove node.
- Write strategies: cache-aside, read-through, write-through, write-behind (flush + crash), write-around.
- Protections: request coalescing, TTL jitter, lock/lease, stale-while-revalidate, negative caching, Bloom filter.
- Invalidation: TTL, explicit delete, tags, versioned keys, deploys.
- Consistency oracle counts stale reads and lost writes.

Scenarios cover articles 1-8 plus a cache-penetration scenario. Each is checked in tests for: fails at start, passes with a known fix, rejects plausible wrong fixes, is deterministic, and matches a golden run (`packages/scenarios/test/golden/`). If an engine change moves a golden file, review the diff and update with `npx vitest run -u`.

Not modelled: real network or Redis behaviour, persistence, accounts.
