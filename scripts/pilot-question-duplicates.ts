import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { resolvePoliticianIdentity } from "../lib/identity/client";
import type { Database } from "../types/database";

const defaultDrafts = "docs/launch/QUESTION_SUGGESTIONS_FIRST_REVIEW_20261122.md";
const pageSize = 200;
const maxPages = 25;
const timeout = 8_000;
const stopWords = new Set("a an and are as at be been by can could did do does for from had has have how if in is it its may more of on or our should so that the their them they this to was were what when where which who why will with would you your".split(" "));

function normalize(value: string) {
  return value.normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase()
    .replace(/['’]/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
}

function questionFocus(value: string) {
  return value.trim().split(/[.!?]\s+/).at(-1) ?? value;
}

function words(value: string) {
  return new Set(normalize(value).split(" ").filter(word => word.length > 2 && !stopWords.has(word))
    .map(word => word.length > 4 ? word.replace(/(?:ies|s)$/u, suffix => suffix === "ies" ? "y" : "") : word));
}

function similarity(a: string, b: string) {
  const original = words(a);
  const candidate = words(b);
  const overlap = [...original].filter(word => candidate.has(word)).length;
  return { overlap, score: overlap / (new Set([...original, ...candidate]).size || 1) };
}

// Identifiers and titles verified against House roll call 224 and Public Law 119-101.
const hr6644 = /\b(?:h[.\s-]*r[.\s-]*6644|p(?:ublic)?[.\s-]*l(?:aw)?[.\s-]*119[-\s–]+101|(?:21st century )?road to housing act|housing for the 21st century act)\b/i;
const housing = /\b(?:hous(?:e|es|ing)|rent(?:al|als|er|ers|s)?|mortgages?|homeowner(?:ship|s)?|first[ -]time \w+buyer(?:s)?|zoning)\b/i;

function compare(draft: string, existing: string) {
  const full = similarity(draft, existing);
  const focus = similarity(questionFocus(draft), questionFocus(existing));
  const near = (signal: ReturnType<typeof similarity>) => signal.overlap >= 3 && signal.score >= 0.4;
  const score = Math.max(full.score, focus.score);
  return {
    exact: normalize(draft) === normalize(existing),
    nearWording: near(full) || near(focus),
    sameBill: hr6644.test(draft) && hr6644.test(existing),
    housingTopic: housing.test(draft) && housing.test(existing),
    wordingScore: Number(score.toFixed(3)),
  };
}

function readDrafts(path: string) {
  const drafts = readFileSync(path, "utf8").split(/\r?\n/).flatMap(line => {
    const row = /^\|\s*([^|]*\b([A-Z]\d{6}))\s*\|\s*([^|]+)\|/.exec(line);
    return row ? [{ official: row[1]!.trim(), bioguideId: row[2]!, question: row[3]!.trim() }] : [];
  });
  if (!drafts.length || drafts.length > 20 || drafts.some(draft => !draft.question.endsWith("?")) ||
      new Set(drafts.map(draft => draft.bioguideId)).size !== drafts.length) {
    throw new Error("Expected 1 to 20 question rows with unique Bioguide IDs");
  }
  return drafts;
}

async function main() {
  config({ path: ".env.local", quiet: true });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publicKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !publicKey) throw new Error("WhyTho public Supabase settings are required");
  const db = createClient<Database>(url, publicKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  const drafts = readDrafts(process.argv[2] ?? defaultDrafts);
  const report = [];

  for (const draft of drafts) {
    const profile = await db.from("politicians").select("id")
      .eq("bioguide_id", draft.bioguideId).eq("is_test", false).eq("is_active", true)
      .is("canonical_politician_id", null).abortSignal(AbortSignal.timeout(timeout)).maybeSingle();
    if (profile.error || !profile.data) throw new Error(`Unique active profile unavailable for ${draft.bioguideId}`);
    const identity = await resolvePoliticianIdentity(profile.data.id, db);
    if (!identity) throw new Error(`Identity unavailable for ${draft.bioguideId}`);
    const matches = [];
    let questionCount = 0;
    let complete = false;

    for (let page = 0; page < maxPages; page++) {
      const offset = page * pageSize;
      const { data, error } = await db.from("questions").select("id,body")
        .in("politician_id", identity.memberIds).eq("status", "active").order("id")
        .range(offset, offset + pageSize - 1).abortSignal(AbortSignal.timeout(timeout));
      if (error || !data) throw new Error(`Public questions unavailable for ${draft.bioguideId}`);
      questionCount += data.length;
      for (const question of data) {
        const signals = compare(draft.question, question.body);
        if (signals.exact || signals.nearWording || signals.sameBill || signals.housingTopic) {
          matches.push({ url: `https://whytho.us/${identity.canonicalSlug}?period=all#question-${question.id}`, body: question.body, ...signals });
        }
      }
      if (data.length < pageSize) {
        complete = true;
        break;
      }
    }

    if (!complete) throw new Error(`Public question check exceeded the row limit for ${draft.bioguideId}`);
    const exactCount = matches.filter(match => match.exact).length;
    const nearWordingCount = matches.filter(match => !match.exact && match.nearWording).length;
    const sameBillCount = matches.filter(match => match.sameBill).length;
    const housingTopicCount = matches.filter(match => match.housingTopic).length;
    matches.sort((a, b) => Number(b.exact) - Number(a.exact) || Number(b.sameBill) - Number(a.sameBill) ||
      Number(b.nearWording) - Number(a.nearWording) || b.wordingScore - a.wordingScore);
    report.push({
      ...draft, profile: `https://whytho.us/${identity.canonicalSlug}`, identityMembers: identity.memberIds.length,
      questionCount, exactCount, nearWordingCount, sameBillCount, housingTopicCount, matches: matches.slice(0, 10),
    });
  }
  console.log(JSON.stringify({
    checkedAt: new Date().toISOString(),
    scope: "Publicly readable active questions across all weeks on each canonical profile and its linked records",
    method: "Exact normalized text, token-overlap screen, official H.R. 6644 identifiers/titles, and housing vocabulary",
    results: report,
  }, null, 2));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Duplicate check failed");
  process.exitCode = 1;
});
