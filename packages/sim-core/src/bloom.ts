import { hash32 } from "./hash";

/** Bloom filter: no false negatives, tunable false positives. Used to shield the origin from lookups for keys that don't exist. */
export class BloomFilter {
  private bits: Uint8Array;
  readonly sizeBits: number;
  readonly hashes: number;

  constructor(expectedKeys: number, bitsPerKey: number) {
    this.sizeBits = Math.max(8, Math.ceil(expectedKeys * bitsPerKey));
    this.hashes = Math.max(1, Math.round(0.693 * bitsPerKey));
    this.bits = new Uint8Array(Math.ceil(this.sizeBits / 8));
  }

  add(key: string): void {
    // Double hashing: h1 + i*h2 gives k independent-enough probes.
    const h1 = hash32(key, 1);
    const h2 = hash32(key, 2) | 1;
    for (let i = 0; i < this.hashes; i++) {
      const bit = (h1 + Math.imul(i, h2)) >>> 0;
      const pos = bit % this.sizeBits;
      this.bits[pos >> 3]! |= 1 << (pos & 7);
    }
  }

  mightContain(key: string): boolean {
    const h1 = hash32(key, 1);
    const h2 = hash32(key, 2) | 1;
    for (let i = 0; i < this.hashes; i++) {
      const pos = ((h1 + Math.imul(i, h2)) >>> 0) % this.sizeBits;
      if (!(this.bits[pos >> 3]! & (1 << (pos & 7)))) return false;
    }
    return true;
  }
}
