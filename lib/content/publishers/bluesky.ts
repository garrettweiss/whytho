/**
 * Bluesky post via the AT Protocol with an app password. Links become facets; the first link gets an
 * external embed card when its page exposes an og:image we can fetch.
 */
import { displayLink } from "../rules";
export { displayLink };

export interface BlueskyCredentials { service: string; identifier: string; appPassword: string }

export function blueskyCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): BlueskyCredentials | null {
  const { BLUESKY_HANDLE, BLUESKY_APP_PASSWORD, BLUESKY_SERVICE } = env;
  if (!BLUESKY_HANDLE || !BLUESKY_APP_PASSWORD) return null;
  return { service: BLUESKY_SERVICE ?? "https://bsky.social", identifier: BLUESKY_HANDLE, appPassword: BLUESKY_APP_PASSWORD };
}

export interface Facet { index: { byteStart: number; byteEnd: number }; features: { $type: "app.bsky.richtext.facet#link"; uri: string }[] }

const URL_PATTERN = /https?:\/\/[^\s)]+/g;

export function prepareBlueskyPost(text: string): { text: string; facets: Facet[]; firstLink: string | null } {
  const encoder = new TextEncoder();
  let output = "";
  let last = 0;
  const facets: Facet[] = [];
  let firstLink: string | null = null;
  for (const match of text.matchAll(URL_PATTERN)) {
    const url = match[0];
    output += text.slice(last, match.index);
    const start = encoder.encode(output).byteLength;
    const shown = displayLink(url);
    output += shown;
    facets.push({ index: { byteStart: start, byteEnd: start + encoder.encode(shown).byteLength }, features: [{ $type: "app.bsky.richtext.facet#link", uri: url }] });
    firstLink ??= url;
    last = (match.index ?? 0) + url.length;
  }
  output += text.slice(last);
  return { text: output, facets, firstLink };
}

interface Session { accessJwt: string; did: string; handle: string }

async function xrpc<T>(service: string, method: string, init: RequestInit, fetchImpl: typeof fetch): Promise<T> {
  const res = await fetchImpl(`${service}/xrpc/${method}`, init);
  const raw = await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const err = JSON.parse(raw) as { message?: string; error?: string }; message = err.message ?? err.error ?? message; } catch { /* keep status */ }
    throw new Error(`Bluesky ${method}: ${message}`);
  }
  return JSON.parse(raw) as T;
}

async function fetchOgImage(pageUrl: string, fetchImpl: typeof fetch): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  try {
    const page = await fetchImpl(pageUrl, { headers: { "User-Agent": "WhyTho content job" } });
    if (!page.ok) return null;
    const html = await page.text();
    const match = /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ?? /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
    if (!match?.[1]) return null;
    const image = await fetchImpl(new URL(match[1], pageUrl).toString());
    if (!image.ok) return null;
    const type = image.headers.get("content-type") ?? "image/jpeg";
    const bytes = await image.arrayBuffer();
    if (bytes.byteLength > 950_000 || !type.startsWith("image/")) return null;
    return { bytes, type };
  } catch { return null; }
}

export async function postToBluesky(text: string, creds: BlueskyCredentials, fetchImpl: typeof fetch = fetch): Promise<{ id: string; url: string }> {
  const session = await xrpc<Session>(creds.service, "com.atproto.server.createSession", {
    method: "POST", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ identifier: creds.identifier, password: creds.appPassword }),
  }, fetchImpl);
  const auth = { Authorization: `Bearer ${session.accessJwt}` };
  const prepared = prepareBlueskyPost(text);
  const record: Record<string, unknown> = {
    $type: "app.bsky.feed.post", text: prepared.text, facets: prepared.facets, createdAt: new Date().toISOString(), langs: ["en"],
  };
  if (prepared.firstLink) {
    const external: Record<string, unknown> = { uri: prepared.firstLink, title: "WhyTho", description: "Ask public officials questions. Read official responses. Response rates stay public." };
    const image = await fetchOgImage(prepared.firstLink, fetchImpl);
    if (image) {
      const upload = await xrpc<{ blob: unknown }>(creds.service, "com.atproto.repo.uploadBlob", { method: "POST", headers: { ...auth, "Content-Type": image.type }, body: image.bytes }, fetchImpl);
      external.thumb = upload.blob;
    }
    record.embed = { $type: "app.bsky.embed.external", external };
  }
  const created = await xrpc<{ uri: string; cid: string }>(creds.service, "com.atproto.repo.createRecord", {
    method: "POST", headers: { ...auth, "Content-Type": "application/json" },
    body: JSON.stringify({ repo: session.did, collection: "app.bsky.feed.post", record }),
  }, fetchImpl);
  const rkey = created.uri.split("/").pop() ?? "";
  return { id: created.uri, url: `https://bsky.app/profile/${session.handle}/post/${rkey}` };
}
