/** Public-read facts for the weekly note. Works with the anon key; nothing here needs service role. */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { WeekFacts } from "./types";

type Client = SupabaseClient<Database>;

export async function loadWeekFacts(client: Client, week: number, now = new Date()): Promise<WeekFacts> {
  const { data: questions, error: questionsError } = await client
    .from("questions")
    .select("id,politician_id,politicians!inner(id,is_test,canonical_politician_id)")
    .eq("week_number", week).eq("status", "active").eq("source", "user").eq("is_seeded", false)
    .eq("politicians.is_test", false)
    .limit(5000);
  if (questionsError) throw new Error(`questions: ${questionsError.message}`);
  const officials = new Set<string>();
  for (const row of questions ?? []) {
    const person = Array.isArray(row.politicians) ? row.politicians[0] : row.politicians;
    officials.add(person?.canonical_politician_id ?? person?.id ?? row.politician_id);
  }

  const { count: answers, error: answersError } = await client
    .from("answers").select("id", { count: "exact", head: true })
    .eq("is_draft", false).eq("is_ai_generated", false).in("answer_type", ["direct", "team_statement"]);
  if (answersError) throw new Error(`answers: ${answersError.message}`);

  const { count: politicians, error: politiciansError } = await client
    .from("politicians").select("id", { count: "exact", head: true })
    .eq("is_active", true).eq("is_test", false).is("canonical_politician_id", null);
  if (politiciansError) throw new Error(`politicians: ${politiciansError.message}`);

  return {
    checked_at: now.toISOString(), week,
    user_questions_this_week: questions?.length ?? 0,
    officials_asked_this_week: officials.size,
    official_answers_total: answers ?? 0,
    politicians_tracked: politicians ?? 0,
  };
}

/** HEAD-style reachability check. Returns the HTTP status or null when the request fails. */
export async function checkLinks(links: Iterable<string>, fetchImpl: typeof fetch = fetch): Promise<Record<string, number | null>> {
  const results: Record<string, number | null> = {};
  for (const link of new Set(links)) {
    try {
      const res = await fetchImpl(link, { method: "GET", redirect: "follow", headers: { "User-Agent": "WhyTho content job link check" } });
      results[link] = res.status;
    } catch { results[link] = null; }
  }
  return results;
}
