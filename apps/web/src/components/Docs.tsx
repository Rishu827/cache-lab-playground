import { scenarios } from "@cache-lab/scenarios";
import { useState, type ReactNode } from "react";

interface Props {
  onOpenScenario(id: string): void;
}

const SECTIONS = [
  { id: "start", title: "Getting started" },
  { id: "flow", title: "How a request flows" },
  { id: "screen", title: "Reading the screen" },
  { id: "policies", title: "Eviction policies" },
  { id: "strategies", title: "Write strategies" },
  { id: "protections", title: "Protections" },
  { id: "invalidation", title: "Invalidation and versions" },
  { id: "layers", title: "Layers and clusters" },
  { id: "controls", title: "Controls reference" },
  { id: "scenarios", title: "Scenarios and challenges" },
  { id: "share", title: "Sharing, embedding, traces" },
  { id: "limits", title: "Accessibility and limits" },
];

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={`doc-${id}`} className="doc-section" aria-labelledby={`doc-${id}-h`}>
      <h2 id={`doc-${id}-h`}>{title}</h2>
      {children}
    </section>
  );
}

function Table({ head, rows }: { head: string[]; rows: ReactNode[][] }) {
  return (
    <div className="doc-table-wrap">
      <table className="doc-table">
        <thead>
          <tr>{head.map((h) => <th key={h} scope="col">{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              {r.map((c, j) => (j === 0 ? <th key={j} scope="row">{c}</th> : <td key={j}>{c}</td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function Docs({ onOpenScenario }: Props) {
  const [active, setActive] = useState("start");
  const go = (id: string) => {
    setActive(id);
    document.getElementById(`doc-${id}`)?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth", block: "start" });
  };

  return (
    <div className="docs">
      <nav className="doc-toc" aria-label="Documentation sections">
        <ul>
          {SECTIONS.map((s) => (
            <li key={s.id}>
              <button className="toc-link" aria-current={active === s.id ? "true" : undefined} onClick={() => go(s.id)}>
                {s.title}
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <article className="doc-body">
        <h1>Cache Lab documentation</h1>
        <p className="lede">Cache Lab simulates a request workload hitting a stack of caches in front of a database. Change a setting, press play, and watch what happens to hit ratio, latency and database load.</p>

        <Section id="start" title="Getting started">
          <ol>
            <li>Pick a <strong>scenario</strong> in the header. Each one matches an article and comes with a challenge.</li>
            <li>Read the <strong>goal</strong> under the diagram. It says what to achieve and shows pass or fail live.</li>
            <li>Press <strong>Play</strong> (or <kbd>Space</kbd>). Use <strong>Step</strong> to advance one event at a time, and the speed menu to go up to 100×.</li>
            <li>Change a control on the left. The run restarts from t=0 so you can compare cleanly.</li>
            <li>Stuck? Open <strong>Show hint</strong>, or try the failure buttons to see how the setup copes.</li>
          </ol>
          <p>Everything is deterministic: the same settings and <strong>seed</strong> always produce the same run. The seed only changes which random requests arrive.</p>
        </Section>

        <Section id="flow" title="How a request flows">
          <p>A <strong>read</strong> tries each place in order and stops at the first answer:</p>
          <ol>
            <li><strong>Bloom filter</strong> (if on). A key that is definitely not in the data set is answered "not found" right away.</li>
            <li><strong>Browser</strong> cache (if configured; private to each client).</li>
            <li><strong>CDN</strong> cache (if configured; shared).</li>
            <li>The main <strong>cache</strong> (one node or a cluster).</li>
            <li>The <strong>origin</strong> database. The answer is stored on the way back, and later requests for the same key hit the cache.</li>
          </ol>
          <p>A <strong>hit</strong> means the database was not needed. A <strong>miss</strong> means it was. The origin handles a limited number of queries at once; the rest wait in a <strong>queue</strong>, which is how overload shows up as latency.</p>
          <p>A <strong>write</strong> goes where the <a href="#doc-strategies" onClick={(e) => { e.preventDefault(); go("strategies"); }}>write strategy</a> says. Every read is compared with the latest acknowledged version of its key (the <strong>consistency oracle</strong>); an older answer counts as a <strong>stale read</strong>.</p>
        </Section>

        <Section id="screen" title="Reading the screen">
          <h3>Diagram</h3>
          <p>Boxes are the tiers a request passes through. Each dot is one request and travels as far as the tier that answered it:</p>
          <Table
            head={["Shape", "Meaning"]}
            rows={[
              ["● circle", "Served from a cache (a hit)"],
              ["▲ triangle", "Went to the database (a miss)"],
              ["■ square", "Error (database failed or was down)"],
              ["◆ diamond", "A write"],
            ]}
          />
          <p>Shapes carry the meaning, not just color. The cache box shows how full it is; with several nodes it shows one bar per node. The origin box shows busy slots and queue length.</p>
          <h3>Numbers</h3>
          <Table
            head={["Metric", "What it means"]}
            rows={[
              ["Hit ratio", "Share of reads answered without the database. Charts show it per second; the tile shows the whole run."],
              ["p50 / p95 / p99", "Latency that 50%, 95%, 99% of requests beat. p95 and p99 expose the slow tail that averages hide."],
              ["Origin load", "Requests that reached the database. The chart shows requests per second."],
              ["Queue depth", "Requests waiting for a free database slot. Anything above a handful means overload."],
              ["Evictions", "Entries pushed out because the cache was full."],
              ["Stale reads", "Reads that returned an older version than the latest acknowledged write or deploy."],
              ["Lost writes", "Buffered write-behind writes destroyed by a crash before reaching the database."],
              ["Cache fill", "Share of cache capacity in use."],
            ]}
          />
          <h3>Inspector and log</h3>
          <p>The inspector lists cache entries: key, version, age, TTL left, hit count, and state (<em>stale</em> if a newer version exists, <em>expired</em>, <em>dirty</em> if not yet written to the database, <em>not found</em> for negative entries, or a tag). In clusters and layered setups, pick which tier to inspect. The event log prints each request, for example <code>t=412ms GET k7 → MISS → DB 80ms → SET [81ms]</code>; filter it by key.</p>
        </Section>

        <Section id="policies" title="Eviction policies">
          <p>When the cache is full, the policy chooses what to remove.</p>
          <Table
            head={["Policy", "Removes", "Good at", "Weak at"]}
            rows={[
              ["FIFO", "The oldest insert", "Simplicity", "Evicts hot keys just because they're old"],
              ["LRU", "Least recently used", "Most workloads with recency", "A one-time scan flushes the hot set"],
              ["LFU", "Least frequently used", "Stable popularity, scans", "Slow to adapt when popularity shifts"],
              ["Random", "A random entry", "Cheap, no bookkeeping", "Ignores everything"],
              ["TinyLFU", "LRU victim, but only if the newcomer has been seen more often", "Scan resistance with recency", "Brand-new keys wait for a second sighting"],
            ]}
          />
        </Section>

        <Section id="strategies" title="Write strategies">
          <Table
            head={["Strategy", "On a write", "Trade-off"]}
            rows={[
              ["cache-aside", "Write the database, then delete the cache entry", "Simple. A read that started before the write can re-insert old data (a race)."],
              ["read-through", "Same as cache-aside here; the cache loads misses itself", "Same behavior in this simulator; differs only in who owns the loading."],
              ["write-through", "Write the database, then update the cache", "Fresh cache; every write pays database latency."],
              ["write-behind", "Write the cache now, flush to the database every N seconds", "Fastest writes. A crash loses the unflushed buffer."],
              ["write-around", "Write the database only", "Doesn't pollute the cache, but cached copies go stale until TTL."],
            ]}
          />
        </Section>

        <Section id="protections" title="Protections">
          <Table
            head={["Protection", "Problem it solves", "How it works here"]}
            rows={[
              ["Request coalescing", "Stampede: many requests miss the same key together", "Concurrent misses share one database call."],
              ["Lock / lease", "Same stampede, different fix", "One request fetches; others wait briefly and re-check the cache. They pay some latency but never queue at the database."],
              ["TTL jitter", "Keys cached together expire together", "Each TTL is randomised by ±N%."],
              ["Stale-while-revalidate", "Users wait while an expired key refreshes", "Serve the expired value for N seconds while refreshing in the background."],
              ["Negative caching", "Repeated lookups for keys that don't exist", "Cache “not found” for a short TTL."],
              ["Bloom filter", "Lookups for keys that don't exist, even new ones", "A compact set of existing keys. “Not in set” is always right; “maybe in set” can be a false positive. More bits per key means fewer false positives."],
            ]}
          />
        </Section>

        <Section id="invalidation" title="Invalidation and versions">
          <ul>
            <li><strong>TTL</strong>: every entry expires after a fixed time. Simple, but data can be stale until then.</li>
            <li><strong>Explicit delete</strong>: cache-aside deletes the key after a write.</li>
            <li><strong>Tags</strong>: keys belong to one of 8 groups (<code>g0</code>…<code>g7</code>). “Invalidate by tag on write” clears the whole group, which is thorough but lowers hit ratio. The failure panel can also clear a tag on demand.</li>
            <li><strong>Versioned keys</strong>: the version goes in the cache key (<code>k7@3</code>). A new version is a new key, so old data can't be served. The old entries linger until TTL or eviction and use space.</li>
            <li><strong>Deploy</strong>: gives every key a new version at once. Layers keep serving old content until their TTL ends, unless keys are versioned. Purging the CDN doesn't touch copies already in browsers.</li>
          </ul>
        </Section>

        <Section id="layers" title="Layers and clusters">
          <h3>Layers</h3>
          <p>Browser and CDN caches sit in front of the main cache. Each has its own size, TTL and latency. A TTL of 0 means <em>no-store</em>: the layer never caches. Browsers are private to each client and can't be purged; the CDN is shared and, in these scenarios, is purged when a write happens.</p>
          <h3>Cluster</h3>
          <p>The cache can be several nodes behind a router. Capacity is per node.</p>
          <ul>
            <li><strong>modulo</strong> sends a key to <code>hash % N</code>. Changing N moves most keys, so most of the cache becomes unreachable.</li>
            <li><strong>consistent</strong> places nodes on a hash ring. Adding a node only takes keys from its neighbours (about 1/(N+1) of keys). <strong>Virtual nodes</strong> make the split even.</li>
          </ul>
          <p>When a node is added or removed, the simulator reports the fraction of keys that now route elsewhere. Entries left on old nodes become unreachable, and a removed node's entries are lost.</p>
        </Section>

        <Section id="controls" title="Controls reference">
          <Table
            head={["Group", "Controls"]}
            rows={[
              ["Workload", "Request rate, read/write mix, number of distinct keys, popularity skew (Zipf), lookups for missing keys, trace replay."],
              ["Cache", "Capacity, TTL, eviction policy, write strategy, write-behind flush interval."],
              ["Layers", "Browser and CDN TTLs (only in scenarios that have them)."],
              ["Cluster", "Node count, router, virtual nodes."],
              ["Origin", "Database latency, concurrent queries, failure rate."],
              ["Protections", "Coalescing, lease, TTL jitter, stale-while-revalidate, negative caching, Bloom filter."],
              ["Invalidation", "Versioned keys, tag invalidation on write."],
              ["Failure injection", "Expire hot key, flush cache, crash write-behind buffer, database outage or slowdown, deploy, purge CDN, invalidate tag, add or remove a cache node. These act on the live run and are not part of the share link."],
            ]}
          />
          <p><strong>Zipf skew</strong> controls how lopsided traffic is: at 0.5 requests are spread widely; at 1.5 a few keys get most of the traffic.</p>
        </Section>

        <Section id="scenarios" title="Scenarios and challenges">
          <p>Each scenario starts in a failing state on purpose. Change the setup until the challenge passes. Some challenges check windows of time, so let the run reach the stated time.</p>
          <div className="scenario-cards">
            {scenarios.map((s) => (
              <div className="scenario-card" key={s.id}>
                <h3>Article {s.article}: {s.title}</h3>
                <p>{s.description}</p>
                <p><strong>Challenge:</strong> {s.challenge.goal}</p>
                <details>
                  <summary>Hints</summary>
                  <ul>{s.challenge.hints.map((h) => <li key={h}>{h}</li>)}</ul>
                </details>
                <button className="primary" onClick={() => onOpenScenario(s.id)}>Open in simulator</button>
              </div>
            ))}
          </div>
        </Section>

        <Section id="share" title="Sharing, embedding, traces">
          <ul>
            <li><strong>Share link</strong> copies a URL containing the whole configuration and seed in the hash. Opening it reproduces the exact run.</li>
            <li><code>?scenario=&lt;id&gt;</code> opens a preset. IDs: {scenarios.map((s, i) => <span key={s.id}>{i ? ", " : ""}<code>{s.id}</code></span>)}.</li>
            <li><code>?embed=1</code> hides the header for use in an iframe. Example: <code>&lt;iframe src="https://your-site/?embed=1&amp;scenario=stampede" width="100%" height="900"&gt;&lt;/iframe&gt;</code></li>
            <li><code>?page=docs</code> opens this page.</li>
          </ul>
          <h3>Replaying a trace</h3>
          <p>In Controls → Workload, open “Replay a trace” and paste or upload requests, one per line: <code>key</code>, or <code>GET key</code> / <code>PUT key</code>. Lines starting with <code>#</code> are comments. The trace loops when it ends. Keys starting with <code>x</code> are treated as nonexistent. Traces over about 400 KB are rejected, and the trace is stored in the share link, so long traces make long links.</p>
        </Section>

        <Section id="limits" title="Accessibility and limits">
          <ul>
            <li>All controls work with the keyboard. <kbd>Space</kbd> plays and pauses when no control has focus.</li>
            <li>Shapes and labels carry meaning, not just color. “Reduce motion” stops the dot animation (your system's reduced-motion setting is respected too).</li>
            <li>On a phone, panels collapse into tabs.</li>
            <li>This is a model: no real Redis or network behavior, no persistence, no accounts. Latencies are simulated and the numbers are for learning, not benchmarking.</li>
          </ul>
        </Section>
      </article>
    </div>
  );
}
