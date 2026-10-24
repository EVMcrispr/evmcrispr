export interface Limits {
  window: number;
  perAddress: number;
  total: number;
}

interface Cached {
  text: string;
  at: number;
  bytes: number;
}
interface Counter {
  start: number;
  hits: number;
}

/** Bounded process-local caches and quotas. Nothing is written to disk. */
export class ApiStore {
  private cache = new Map<string, Cached>();
  private buckets = new Map<string, Map<string, Counter>>();
  private bytes = 0;
  private closed = false;

  constructor(
    private readonly maxEntries = 1024,
    private readonly maxBytes = 64 * 1024 * 1024,
  ) {}

  get<T>(key: string): { value: T; at: number } | undefined {
    const row = this.cache.get(key);
    return row ? { value: JSON.parse(row.text) as T, at: row.at } : undefined;
  }

  set(key: string, value: unknown, at: number): void {
    if (this.closed) return;
    const text = JSON.stringify(value);
    const bytes = Buffer.byteLength(text);
    if (bytes > this.maxBytes) return;
    this.bytes -= this.cache.get(key)?.bytes ?? 0;
    this.cache.delete(key);
    this.cache.set(key, { text, bytes, at });
    this.bytes += bytes;
    while (this.cache.size > this.maxEntries || this.bytes > this.maxBytes) {
      const oldest = this.cache.keys().next().value;
      if (oldest === undefined) break;
      this.bytes -= this.cache.get(oldest)!.bytes;
      this.cache.delete(oldest);
    }
  }

  /** Synchronous counting is atomic within the single server process. */
  count(
    bucket: string,
    address: string,
    limits: Limits,
    now: number,
  ): number | undefined {
    if (this.closed) throw new Error("quota store is closed");
    let counts = this.buckets.get(bucket);
    if (!counts) {
      counts = new Map();
      this.buckets.set(bucket, counts);
    }
    let total = 0;
    let oldest = now;
    let named = 0;
    for (const [key, row] of counts) {
      if (now - row.start >= limits.window) {
        counts.delete(key);
        continue;
      }
      total += row.hits;
      oldest = Math.min(oldest, row.start);
      if (key !== "others") named++;
    }
    if (total >= limits.total) return Math.max(1, oldest + limits.window - now);
    const key = counts.has(address) || named < 1024 ? address : "others";
    const row = counts.get(key) ?? { start: now, hits: 0 };
    if (row.hits >= limits.perAddress)
      return Math.max(1, row.start + limits.window - now);
    row.hits++;
    counts.set(key, row);
    return undefined;
  }

  healthy(): boolean {
    return !this.closed;
  }

  close(): void {
    this.closed = true;
    this.cache.clear();
    this.buckets.clear();
    this.bytes = 0;
  }
}
