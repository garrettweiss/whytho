import test from "node:test";
import assert from "node:assert/strict";
import { oauthHeader, postToX } from "./publishers/x";
import { displayLink, prepareBlueskyPost } from "./publishers/bluesky";
import { postToThreads } from "./publishers/threads";

const creds = { consumerKey: "ck", consumerSecret: "cs", accessToken: "at", accessSecret: "as", handle: "WhyTho_official" };

test("OAuth 1.0a header is deterministic for a fixed nonce and timestamp", () => {
  const header = oauthHeader("POST", "https://api.twitter.com/2/tweets", creds, "nonce", "1700000000");
  assert.ok(header.startsWith("OAuth oauth_consumer_key=\"ck\""));
  assert.ok(header.includes("oauth_signature_method=\"HMAC-SHA1\""));
  assert.equal(header, oauthHeader("POST", "https://api.twitter.com/2/tweets", creds, "nonce", "1700000000"));
});

test("X publisher refuses mentions and surfaces API errors", async () => {
  await assert.rejects(postToX("hi @someone", creds, async () => new Response("{}", { status: 201 })), /never mention/);
  await assert.rejects(postToX("hello", creds, async () => new Response(JSON.stringify({ detail: "Forbidden" }), { status: 403 })), /Forbidden/);
  const ok = await postToX("hello", creds, async () => new Response(JSON.stringify({ data: { id: "123" } }), { status: 201 }));
  assert.deepEqual(ok, { id: "123", url: "https://x.com/WhyTho_official/status/123" });
});

test("Bluesky facets use UTF-8 byte offsets and shortened display text", () => {
  const text = "Ask “one” question: https://whytho.us/verify?utm_source=bluesky&utm_campaign=2026w48-a10 today";
  const prepared = prepareBlueskyPost(text);
  assert.equal(prepared.text, "Ask “one” question: whytho.us/verify today");
  assert.equal(prepared.facets.length, 1);
  const facet = prepared.facets[0]!;
  const bytes = new TextEncoder().encode(prepared.text);
  assert.equal(new TextDecoder().decode(bytes.slice(facet.index.byteStart, facet.index.byteEnd)), "whytho.us/verify");
  assert.equal(facet.features[0]!.uri, "https://whytho.us/verify?utm_source=bluesky&utm_campaign=2026w48-a10");
  assert.equal(displayLink("https://whytho.us/?utm_source=x"), "whytho.us");
});

test("Threads publisher creates a container, publishes it and reads the permalink", async () => {
  const calls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push(`${init?.method ?? "GET"} ${url.split("?")[0]}`);
    if (url.includes("/threads_publish")) return new Response(JSON.stringify({ id: "pub1" }));
    if (url.endsWith("/threads")) {
      const body = init?.body as URLSearchParams;
      assert.equal(body.get("link_attachment"), "https://whytho.us/");
      return new Response(JSON.stringify({ id: "c1" }));
    }
    return new Response(JSON.stringify({ permalink: "https://www.threads.net/@whytho/post/abc" }));
  }) as typeof fetch;
  const result = await postToThreads("Ask here: https://whytho.us/", { userId: "u1", accessToken: "t" }, fetchImpl, async () => undefined);
  assert.deepEqual(result, { id: "pub1", url: "https://www.threads.net/@whytho/post/abc" });
  assert.deepEqual(calls, ["POST https://graph.threads.net/v1.0/u1/threads", "POST https://graph.threads.net/v1.0/u1/threads_publish", "GET https://graph.threads.net/v1.0/pub1"]);
});
