/**
 * Query timeout guard.
 *
 * Without this, a stalled Postgres instance leaves page renders hanging for the
 * full origin timeout (observed: 40s per request during the August 2026 outage)
 * and the page then degrades silently to an empty state returning HTTP 200.
 *
 * Wrapping a query makes the failure loud: it throws, Next.js renders the error
 * boundary, and Sentry reports it.
 */

export const DEFAULT_QUERY_TIMEOUT_MS = 5_000;

export class QueryTimeoutError extends Error {
  constructor(label: string, ms: number) {
    super(`Database query "${label}" exceeded ${ms}ms`);
    this.name = "QueryTimeoutError";
  }
}

/** Reject if `promise` has not settled within `ms`. */
export async function withTimeout<T>(
  promise: PromiseLike<T>,
  label: string,
  ms: number = DEFAULT_QUERY_TIMEOUT_MS
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new QueryTimeoutError(label, ms)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

export class EmptyResultError extends Error {
  constructor(label: string) {
    super(
      `Database returned an empty result for "${label}". Refusing to render an empty page. ` +
        `This usually means the database is unreachable or degraded.`
    );
    this.name = "EmptyResultError";
  }
}

/**
 * Guard against rendering a hollow page.
 *
 * The site has 11,513 politicians, so a zero count is never legitimate: it means
 * the query failed. Throwing here is what turns a silent outage into an alert.
 */
export function assertNonEmpty(count: number | null | undefined, label: string): number {
  if (count === null || count === undefined || count === 0) {
    throw new EmptyResultError(label);
  }
  return count;
}
