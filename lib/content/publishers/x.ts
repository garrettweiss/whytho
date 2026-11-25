/**
 * Standalone brand post on X from @WhyTho_official. OAuth 1.0a user context.
 * This is not outreach: no reply, no mention, no recipient. Those paths stay blocked in the Jack scripts.
 */
import * as crypto from "node:crypto";

export interface XCredentials { consumerKey: string; consumerSecret: string; accessToken: string; accessSecret: string; handle: string }

export function xCredentialsFromEnv(env: NodeJS.ProcessEnv = process.env): XCredentials | null {
  const { X_API_KEY, X_API_SECRET, X_ACCESS_TOKEN, X_ACCESS_TOKEN_SECRET, X_WHYTHO_HANDLE } = env;
  if (!X_API_KEY || !X_API_SECRET || !X_ACCESS_TOKEN || !X_ACCESS_TOKEN_SECRET) return null;
  return { consumerKey: X_API_KEY, consumerSecret: X_API_SECRET, accessToken: X_ACCESS_TOKEN, accessSecret: X_ACCESS_TOKEN_SECRET, handle: X_WHYTHO_HANDLE ?? "WhyTho_official" };
}

function percentEncode(value: string): string {
  return encodeURIComponent(value).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

export function oauthHeader(method: string, url: string, creds: XCredentials, nonce = crypto.randomBytes(16).toString("hex"), timestamp = Math.floor(Date.now() / 1000).toString()): string {
  const params: Record<string, string> = {
    oauth_consumer_key: creds.consumerKey, oauth_nonce: nonce, oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: timestamp, oauth_token: creds.accessToken, oauth_version: "1.0",
  };
  const paramString = Object.keys(params).sort().map((k) => `${percentEncode(k)}=${percentEncode(params[k] ?? "")}`).join("&");
  const base = [method.toUpperCase(), percentEncode(url), percentEncode(paramString)].join("&");
  const key = `${percentEncode(creds.consumerSecret)}&${percentEncode(creds.accessSecret)}`;
  params.oauth_signature = crypto.createHmac("sha1", key).update(base).digest("base64");
  return "OAuth " + Object.keys(params).sort().map((k) => `${percentEncode(k)}="${percentEncode(params[k] ?? "")}"`).join(", ");
}

export async function postToX(text: string, creds: XCredentials, fetchImpl: typeof fetch = fetch): Promise<{ id: string; url: string }> {
  if (/(^|[\s(])@[A-Za-z0-9_]+/.test(text)) throw new Error("Refusing to post: brand posts never mention an account");
  const url = "https://api.twitter.com/2/tweets";
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { Authorization: oauthHeader("POST", url, creds), "Content-Type": "application/json" },
    body: JSON.stringify({ text }),
  });
  const raw = await res.text();
  if (!res.ok) {
    let message = `HTTP ${res.status}`;
    try { const err = JSON.parse(raw) as { detail?: string; title?: string; errors?: { message: string }[] }; message = err.errors?.[0]?.message ?? err.detail ?? err.title ?? message; } catch { /* keep status */ }
    throw new Error(`X API error: ${message}`);
  }
  const json = JSON.parse(raw) as { data?: { id: string } };
  if (!json.data?.id) throw new Error("X API returned no post id");
  return { id: json.data.id, url: `https://x.com/${creds.handle}/status/${json.data.id}` };
}
