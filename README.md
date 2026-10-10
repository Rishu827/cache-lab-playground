# Cache Lab

An interactive, in-browser cache simulator. Run a request workload against a configurable cache stack and watch what happens.

- **Learn by doing** — every article links to a scenario preset and a challenge.
- **Deterministic and shareable** — the same config produces the same run, and the whole config lives in the URL.
- **Zero backend** — static site, free to host, embeddable via iframe.

> Status: planning. No code yet. See [docs/spec.md](docs/spec.md).

## Planned layout

```
packages/sim-core/   engine, components, strategies, policies, metrics
packages/scenarios/  scenario definitions + challenge checks
apps/web/            React UI
docs/                spec, scenario authoring guide
```
