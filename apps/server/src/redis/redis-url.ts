/**
 * Reads `REDIS_URL` once per call. An empty string means "Redis disabled" so
 * every Redis-powered feature can degrade gracefully instead of failing boot.
 */
export function getRedisUrl(): string | null {
  const url = process.env.REDIS_URL?.trim();
  return url ? url : null;
}

/** Whether the optional Redis integration is configured. */
export function isRedisEnabled(): boolean {
  return getRedisUrl() !== null;
}
