import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { isValidIsoWeek } from "@/lib/profile/helpers";
import { collectCompletePages, LEADERBOARD_QUERY_PAGE_SIZE, rankOfficialResponses } from "./ranking";
import type { LeaderboardData, OfficialAnswerReference, RankingQuestion } from "./types";

/** Cached public metadata only. A timeout fails the page rather than publishing partial ranks. */
export const getLeaderboard = unstable_cache(async (): Promise<LeaderboardData> => {
  const supabase = createPublicClient();
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 20_000);
  try {
    const { data: weekNumber, error: weekError } = await supabase.rpc("current_week_number").abortSignal(controller.signal);
    if (weekError || typeof weekNumber !== "number" || !isValidIsoWeek(weekNumber)) {
      throw new Error("Leaderboard reporting period unavailable");
    }

    const questions = await collectCompletePages<RankingQuestion>(async (after) => {
      if (controller.signal.aborted) throw new Error("Leaderboard read timed out");
      let query = supabase.from("questions")
        .select("id,politician_id,week_number,net_upvotes,status,politicians!inner(id,slug,full_name,office,state,party,photo_url,is_active,is_test,is_candidate,politician_type)")
        .eq("status", "active")
        .eq("week_number", weekNumber)
        .gte("net_upvotes", 10)
        .eq("politicians.is_active", true)
        .eq("politicians.is_test", false)
        .order("id", { ascending: true })
        .limit(LEADERBOARD_QUERY_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      const { data, error } = await query.abortSignal(controller.signal);
      if (error || !data) throw new Error("Leaderboard questions unavailable");
      return data;
    });

    const answers = questions.length ? await collectCompletePages<OfficialAnswerReference>(async (after) => {
      if (controller.signal.aborted) throw new Error("Leaderboard read timed out");
      let query = supabase.from("answers")
        .select("id,question_id,politician_id,answer_type,is_ai_generated,is_draft,question:questions!inner(week_number,status,net_upvotes,politician:politicians!inner(is_active,is_test))")
        .in("answer_type", ["direct", "team_statement"])
        .eq("is_ai_generated", false)
        .eq("is_draft", false)
        .eq("question.week_number", weekNumber)
        .eq("question.status", "active")
        .gte("question.net_upvotes", 10)
        .eq("question.politician.is_active", true)
        .eq("question.politician.is_test", false)
        .order("id", { ascending: true })
        .limit(LEADERBOARD_QUERY_PAGE_SIZE);
      if (after) query = query.gt("id", after);
      const { data, error } = await query.abortSignal(controller.signal);
      if (error || !data) throw new Error("Leaderboard responses unavailable");
      return data.map((answer) => ({
        id: answer.id,
        question_id: answer.question_id,
        politician_id: answer.politician_id,
        answer_type: answer.answer_type,
        is_ai_generated: answer.is_ai_generated,
        is_draft: answer.is_draft,
      }));
    }) : [];

    if (controller.signal.aborted) throw new Error("Leaderboard read timed out");
    const entries = rankOfficialResponses(questions, answers, weekNumber);
    return {
      weekNumber,
      entries,
      totalQualifyingQuestions: entries.reduce((total, entry) => total + entry.qualifyingQuestions, 0),
      totalAnsweredQuestions: entries.reduce((total, entry) => total + entry.answeredQualifying, 0),
      generatedAt: new Date().toISOString(),
    };
  } finally {
    clearTimeout(timer);
  }
}, ["public-official-response-leaderboard-v1"], { revalidate: 300, tags: ["politician-profile"] });
