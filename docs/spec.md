# Cache Lab — Playground Spec

Working title: **Cache Lab**. An interactive, in-browser simulator where learners run a request workload against a configurable cache stack and watch what happens.

## 1. Vision and goals

- Learn by doing: every article links to a scenario preset and a challenge.
- Deterministic and shareable: the same config produces the same run, and the whole config lives in the URL.
- Zero backend: static site, free to host and embeddable in the blog via iframe.
- Non-goals (v1): real Redis/network behavior, user accounts, persistence, benchmarking real systems.

## 2. Tech stack (proposed)

- Vite + React + TypeScript, static build deployable to Vercel or GitHub Pages.
- Simulation core as a separate pure-TS package with no DOM or React dependency, so it is unit-testable and reusable.
- Charts: a lightweight library (uPlot or Recharts). Animation: SVG or canvas with a small custom layer.
- Tests: Vitest for the core, Playwright for a few UI smoke tests.

## 3. Repo structure

```
cache-lab/
  packages/
    sim-core/        # engine, components, strategies, policies, metrics
    scenarios/       # JSON/TS scenario definitions + challenge checks
  apps/
    web/             # React UI
  docs/              # spec, scenario authoring guide
```

## 4. Simulation model

Discrete-event simulation with a virtual clock in ms, driven by a min-heap event queue. This gives step, pause, and fast-forward for free.

Seeded PRNG (e.g. mulberry32), so a run is a pure function of `(config, seed)`.

### Components (each with a small interface)

- **WorkloadGenerator**: uniform, Zipf (configurable skew), sequential scan, burst, hot-key, and trace replay. Supports a read/write ratio.
- **Cache**: get/set/delete, capacity, TTL, and pluggable `EvictionPolicy`.
- **Origin (DB)**: latency distribution, a concurrency limit with queueing (so overload is visible), failure/slowdown injection, and a versioned data store used as ground truth.
- **Layer (v2)**: browser, CDN, and app caches chained in front, each with its own TTL and headers.
- **Cluster (v2)**: N cache nodes plus a router (modulo vs consistent hash with vnodes).

### Pluggable behaviors

- **Strategies**: cache-aside, read-through, write-through, write-behind (with a flush interval and a crash event), write-around.
- **Eviction**: FIFO, LRU, LFU, Random, then TinyLFU.
- **Invalidation**: TTL, explicit delete, versioned keys, tags, stale-while-revalidate.
- **Protections**: request coalescing, TTL jitter, lock/lease, negative caching, Bloom filter.

### Consistency oracle

Every read is compared with the origin's latest version, so the UI can count stale reads and show a timeline of when they occurred. This powers the invalidation and race-condition lessons.

## 5. Metrics

Hit/miss ratio (cumulative and windowed), average/p50/p95/p99 latency, origin load (QPS and queue depth), evictions, stale read count, error count, and cache fill percentage. Every metric is sampled per time window for charting.

## 6. UI layout

- **Scenario bar**: pick a preset, see the article link and a short description.
- **Topology canvas**: boxes for Client → Cache → Origin, with animated request dots (green for hit, orange for miss, red for error).
- **Cache inspector**: grid of entries showing key, version, age/TTL remaining, and hit count. Evicted and stale entries are highlighted.
- **Controls panel**: workload, cache size, TTL, policy, strategy, origin latency/concurrency, and a failure-injection panel with buttons like "expire hot key now" or "crash write-behind buffer".
- **Charts panel**: hit ratio, latency percentiles, origin load, and a stale-read timeline.
- **Transport**: play, pause, step one event, speed (1x to 100x), reset, and seed.
- **Event log**: a human-readable request trace (`t=412ms GET k7 → MISS → DB 80ms → SET`), filterable by key.
- **Challenge drawer**: goal, hints, and a pass/fail check evaluated against the metrics.

## 7. Scenarios and challenges (mapped to articles)

| Article | Scenario | Challenge example |
|---|---|---|
| 1 | Latency ladder and hit-ratio explorer | Reach p95 < 50 ms with the smallest possible cache |
| 2 | Same workload under 5 strategies | Find the strategy that survives a crash with zero lost writes |
| 3 | Zipf workload plus a scan burst | Keep hit ratio above 70% during the scan, using the right policy |
| 4 | Read/write race injection | Eliminate stale reads without destroying the hit ratio |
| 5 | Multi-layer request path | Make a deploy visible to all users immediately without disabling caching |
| 6 | Hot key expiry spike | Keep origin queue depth under limit during a stampede |
| 7 | 5-node cluster, add and remove a node | Cut remapped keys on node addition to under 25% |
| 8 | Capstone sandbox | Meet a given latency and origin-load budget with a given cost |

Scenarios are defined as data (config plus challenge predicate), so adding one means adding a file with no engine changes.
