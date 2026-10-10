import type { Summary } from "@cache-lab/sim-core";

const pct = (x: number) => Math.round(x * 100);
const ms = (x: number) => (x < 10 ? x.toFixed(1) : Math.round(x).toString());

export interface Narration {
  /** Plain-English sentences describing what the run looks like right now. */
  lines: string[];
  /** Things that are going wrong, worded as problems. */
  warnings: string[];
}

/** Turn raw metrics into a couple of sentences so a first-time visitor doesn't have to read charts. */
export function narrate(s: Summary): Narration {
  const lines: string[] = [];
  const warnings: string[] = [];
  const answered = s.hits + s.misses;
  if (s.reads === 0) return { lines: ["Press Play to start sending requests."], warnings };

  if (answered > 0) {
    const tiers = Object.entries(s.hitsByTier).filter(([, n]) => n > 0);
    if (tiers.length > 1) {
      const parts = tiers.map(([name, n]) => `${name} ${pct(n / answered)}%`).join(", ");
      lines.push(`${pct(s.hitRatio)} of reads never reached the database (${parts}).`);
    } else {
      lines.push(`Out of every 100 reads, ${pct(s.hitRatio)} were answered by the cache and ${100 - pct(s.hitRatio)} had to ask the database.`);
    }
  }
  lines.push(`A typical request takes ${ms(s.p50)} ms. The slowest 1 in 20 take ${ms(s.p95)} ms or more.`);

  const queueNow = s.windows.length ? s.windows[s.windows.length - 1]!.maxQueueDepth : 0;
  if (queueNow > 10) warnings.push(`The database is overloaded: up to ${queueNow} requests are waiting in line.`);
  if (s.staleReads > 0) warnings.push(`${s.staleReads} read${s.staleReads === 1 ? "" : "s"} returned out-of-date data.`);
  if (s.lostWrites > 0) warnings.push(`${s.lostWrites} write${s.lostWrites === 1 ? " was" : "s were"} lost in a crash.`);
  if (s.errors > 0) warnings.push(`${s.errors} request${s.errors === 1 ? "" : "s"} failed.`);
  if (s.lastRemap) warnings.push(`A node ${s.lastRemap.kind === "add" ? "joined" : "left"}: ${pct(s.lastRemap.remapFraction)}% of keys now live on a different node.`);
  return { lines, warnings };
}
