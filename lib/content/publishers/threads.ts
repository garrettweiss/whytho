/**
 * Threads text post via the Threads API (graph.threads.net). Two steps: create a container, then publish it.
 * Needs a Meta app with the Threads use case and a long-lived user token (refresh every 60 days).
 */

export interface ThreadsCredentials { userId: string; accessToken: string }

export function threadsCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): ThreadsCredentials | null {
  const { THREADS_USER_ID, THREADS_ACCESS_TOKEN } = env;
  if (!THREADS_USER_ID || !THREADS_ACCESS_TOKEN) return null;
  return { userId: THREADS_USER_ID, accessToken: THREADS_ACCESS_TOKEN };
}

const API = "https://graph.threads.net/v1.0";
const URL_PATTERN = /https?:\/\/[^\s)]+/;

async function call<T>(url: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(url, init);
  const raw = await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const err = JSON.parse(raw) as { error?: { message?: string } }; message = err.error?.message ?? message; } catch { /* keep status */ }
    throw new Error(`Threads API: ${message}`);
  }
  return JSON.parse(raw) as T;
}

export async function postToThreads(text: string, creds: ThreadsCredentials, fetchImpl: typeof fetch = fetch, wait: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms))): Promise<{ id: string; url: string }> {
  const link = URL_PATTERN.exec(text)?.[0];
  const create = new URLSearchParams({ media_type: "TEXT", text, access_token: creds.accessToken });
  if (link) create.set("link_attachment", link);
  const container = await call<{ id: string }>(`${API}/${creds.userId}/threads`, { method: "POST", body: create }, fetchImpl);
  await wait(3000);
  const publish = new URLSearchParams({ creation_id: container.id, access_token: creds.accessToken });
  const published = await call<{ id: string }>(`${API}/${creds.userId}/threads_publish`, { method: "POST", body: publish }, fetchImpl);
  let permalink = `https://www.threads.net/`;
  try {
    const info = await call<{ permalink?: string }>(`${API}/${published.id}?fields=permalink&access_token=${encodeURIComponent(creds.accessToken)}`, { method: "GET" }, fetchImpl);
    if (info.permalink) permalink = info.permalink;
  } catch { /* permalink is a convenience */ }
  return { id: published.id, url: permalink };
}
