import { RateLimitError } from "./errors";

/**
 * Einfacher In-Memory-Limiter (Sliding Window).
 * Bei gesetzter REDIS_URL wird derselbe Vertrag von einem Redis-Backend bedient
 * (siehe src/modules/queue/README-Ansatz) – die Schnittstelle bleibt gleich.
 */
type Bucket = { hits: number[] };
const buckets = new Map<string, Bucket>();

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export function checkRateLimit({ key, limit, windowMs }: RateLimitOptions): {
  allowed: boolean;
  remaining: number;
  resetAt: number;
} {
  const now = Date.now();
  const bucket = buckets.get(key) ?? { hits: [] };
  bucket.hits = bucket.hits.filter((ts) => now - ts < windowMs);
  const allowed = bucket.hits.length < limit;
  if (allowed) bucket.hits.push(now);
  buckets.set(key, bucket);
  return {
    allowed,
    remaining: Math.max(0, limit - bucket.hits.length),
    resetAt: (bucket.hits[0] ?? now) + windowMs,
  };
}

export function enforceRateLimit(options: RateLimitOptions): void {
  const result = checkRateLimit(options);
  if (!result.allowed) {
    throw new RateLimitError(
      `Zu viele Anfragen. Bitte in ${Math.ceil((result.resetAt - Date.now()) / 1000)} Sekunden erneut versuchen.`,
    );
  }
}

export function resetRateLimits(): void {
  buckets.clear();
}
