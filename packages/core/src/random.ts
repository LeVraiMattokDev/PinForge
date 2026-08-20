/**
 * A seeded generator, because the simulation has to be reproducible: the same
 * project and the same inputs must produce the same result on every machine, or
 * the deterministic tests are worthless. Math.random is never used.
 */
export class Random {
  private state: number;

  constructor(seed = 1) {
    this.state = seed >>> 0 || 1;
  }

  /** A number in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  between(low: number, high: number): number {
    return low + this.next() * (high - low);
  }
}
