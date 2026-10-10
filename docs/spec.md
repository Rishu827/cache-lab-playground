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
