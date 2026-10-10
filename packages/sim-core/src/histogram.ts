/** Log-bucketed latency histogram (~2% relative error). Cheap to update and to query. */
const GROWTH = 1.02;
const LOG_GROWTH = Math.log(GROWTH);

export class Histogram {
  private buckets = new Map<number, number>();
  count = 0;
  sum = 0;

  add(value: number): void {
    const v = Math.max(value, 0.01);
    const idx = Math.floor(Math.log(v) / LOG_GROWTH);
    this.buckets.set(idx, (this.buckets.get(idx) ?? 0) + 1);
    this.count++;
    this.sum += value;
  }

  mean(): number {
    return this.count === 0 ? 0 : this.sum / this.count;
  }

  /** Approximate quantile, q in [0, 1]. */
  quantile(q: number): number {
    if (this.count === 0) return 0;
    const target = Math.ceil(q * this.count);
    let seen = 0;
    for (const idx of [...this.buckets.keys()].sort((a, b) => a - b)) {
      seen += this.buckets.get(idx)!;
      if (seen >= target) return Math.pow(GROWTH, idx + 0.5);
    }
    return 0;
  }
}
