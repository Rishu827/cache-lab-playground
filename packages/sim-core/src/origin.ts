import { Rng } from "./prng";
import { Scheduler } from "./scheduler";

export interface OriginConfig {
  /** Median service latency in ms. */
  latencyMs: number;
  /** Log-normal sigma for latency jitter (0 = constant latency). */
  jitter: number;
  /** Max requests in service at once; extras queue. */
  concurrency: number;
  /** Probability a request fails (0..1). */
  failureRate: number;
}

export type OriginResult = { ok: true; version: number } | { ok: false };

interface Job {
  kind: "read" | "write";
  key: string;
  version: number; // write: version to store
  done: (r: OriginResult, serviceMs: number) => void;
}

/** The database: a versioned ground-truth store with limited concurrency and a FIFO queue. */
export class Origin {
  private store = new Map<string, number>();
  private queue: Job[] = [];
  private inFlight = 0;
  private slowdown = 1;
  private outage = false;

  requests = 0;
  maxQueueDepth = 0;

  constructor(readonly config: OriginConfig, private sched: Scheduler, private rng: Rng) {}

  get queueDepth(): number {
    return this.queue.length;
  }
  get busy(): number {
    return this.inFlight;
  }

  setSlowdown(factor: number) {
    this.slowdown = factor;
  }
  setOutage(on: boolean) {
    this.outage = on;
  }
  get isOutage(): boolean {
    return this.outage;
  }

  version(key: string): number {
    return this.store.get(key) ?? 0;
  }

  read(key: string, done: Job["done"]): void {
    this.submit({ kind: "read", key, version: 0, done });
  }

  write(key: string, version: number, done: Job["done"]): void {
    this.submit({ kind: "write", key, version, done });
  }

  private submit(job: Job) {
    this.requests++;
    this.queue.push(job);
    this.maxQueueDepth = Math.max(this.maxQueueDepth, this.queue.length);
    this.pump();
  }

  private serviceTime(): number {
    const { latencyMs, jitter } = this.config;
    const ms = jitter > 0 ? latencyMs * Math.exp(jitter * this.rng.normal()) : latencyMs;
    return ms * this.slowdown;
  }

  private pump() {
    while (this.inFlight < Math.max(1, this.config.concurrency) && this.queue.length > 0) {
      const job = this.queue.shift()!;
      this.inFlight++;
      // A read observes the store when service *starts*, so a concurrent write can make it stale.
      const snapshot = this.store.get(job.key) ?? 0;
      const failed = this.outage || this.rng.next() < this.config.failureRate;
      const svc = this.serviceTime();
      this.sched.schedule(svc, () => {
        this.inFlight--;
        if (failed) job.done({ ok: false }, svc);
        else if (job.kind === "write") {
          this.store.set(job.key, Math.max(this.store.get(job.key) ?? 0, job.version));
          job.done({ ok: true, version: job.version }, svc);
        } else job.done({ ok: true, version: snapshot }, svc);
        this.pump();
      });
    }
  }
}
