/** TTL for the workspace dashboard aggregate (Phase 11 spec: 60 seconds). */
export const DASHBOARD_CACHE_TTL_SECONDS = 60;

/**
 * Version counter per workspace. Task / project writes `INCR` this key so every
 * cached dashboard variant (`v{version}`) for the workspace is instantly stale.
 * A versioned namespace avoids `SCAN` / wildcard `DEL`, which are expensive and
 * unsupported on some serverless Redis providers.
 */
export function dashboardVersionKey(organizationId: string): string {
  return `dashboard:ver:${organizationId}`;
}

/** Cache key for one user's dashboard inside one workspace version. */
export function dashboardCacheKey(organizationId: string, version: number, userId: string): string {
  return `dashboard:${organizationId}:v${version}:${userId}`;
}
