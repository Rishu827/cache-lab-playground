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

## v1 status

Done: engine (event queue, seeded RNG, workloads, FIFO/LRU/LFU/Random/TinyLFU, 5 write strategies, coalescing / TTL jitter / stale-while-revalidate, consistency oracle, failure injection), scenarios for articles 1, 2, 3, 4, 6, 8, and the full UI.

Not yet: layers and cluster (v2; scenarios for articles 5 and 7), negative caching, Bloom filter, lock/lease, tag and versioned-key invalidation, trace file upload, golden-file snapshots.
