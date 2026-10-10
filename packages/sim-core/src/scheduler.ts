import { MinHeap } from "./heap";

interface Scheduled {
  time: number;
  seq: number;
  fn: () => void;
}

/** Discrete-event scheduler with a virtual clock in ms. Ties break by insertion order. */
export class Scheduler {
  private queue = new MinHeap<Scheduled>((a, b) => a.time < b.time || (a.time === b.time && a.seq < b.seq));
  private seq = 0;
  now = 0;

  get pending(): number {
    return this.queue.size;
  }

  /** Time of the next event, or undefined if the queue is empty. */
  nextTime(): number | undefined {
    return this.queue.peek()?.time;
  }

  schedule(delayMs: number, fn: () => void): void {
    this.queue.push({ time: this.now + Math.max(0, delayMs), seq: this.seq++, fn });
  }

  /** Run exactly one event. Returns false if there was nothing to run. */
  step(): boolean {
    const ev = this.queue.pop();
    if (!ev) return false;
    this.now = ev.time;
    ev.fn();
    return true;
  }

  /** Run all events with time <= t, then advance the clock to t. */
  runUntil(t: number): void {
    for (let next = this.nextTime(); next !== undefined && next <= t; next = this.nextTime()) this.step();
    if (this.now < t) this.now = t;
  }
}
