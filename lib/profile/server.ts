import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import {
  calculateResponseRate,
  isValidIsoWeek,
  profilePeriodCutoff,
  readProfileCount,
  resolveProfileView,
  safeWebUrl,
  toPublicAnswers,
} from "./helpers";
import type { ProfileMetadata, ProfileQuestion, ProfileView, PublicProfileData, PublicProfilePolitician } from "./types";

const POLITICIAN_FIELDS = "id,slug,full_name,office,state,party,district,bio,photo_url,website_url,social_handles,verification_tier,is_active,is_test,politician_type,is_candidate,candidate_office,candidate_election_year,incumbent_challenge,candidate_status,election_date";
const QUESTION_FIELDS = `id,body,net_upvotes,is_seeded,source,status,created_at,week_number,
  x_posts:x_post_id(author_handle,author_name,tweet_url),
  answers(id,answer_type,body,is_ai_generated,is_draft,ai_confidence,sources,is_disputed,created_at,
    answer_media(id,media_type,public_url,file_name))`;
const COUNT_FIELDS = "total:questions(count),qualified:questions(count),answered:questions(count,official:answers!inner()),responded:questions(count,official:answers!inner())";
const CACHE_OPTIONS = { revalidate: 300, tags: ["politician-profile"] };

async function boundedRead<T>(read: (signal: AbortSignal) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8_000);
  try {
    return await read(controller.signal);
  } finally {
    clearTimeout(timer);
  }
}

function validSlug(slug: string): boolean {
  return slug.length > 0 && slug.length <= 200 && !/[\u0000-\u0020\u007f/\\?#]/.test(slug);
}

function publicSocialHandles(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const record = value as Record<string, unknown>;
  return Object.fromEntries(["x", "twitter", "facebook", "instagram", "youtube", "tiktok"].flatMap((key) => {
    const handle = record[key];
    return typeof handle === "string" && handle.length <= 500 && !/[\u0000-\u001f\u007f]/.test(handle) ? [[key, handle]] : [];
  }));
}

const loadPolitician = unstable_cache(async (slug: string): Promise<PublicProfilePolitician | null> => boundedRead(async (signal) => {
  const { data, error } = await createPublicClient().from("politicians")
    .select(POLITICIAN_FIELDS)
    .eq("slug", slug)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw new Error("Public profile unavailable");
  if (!data) return null;
  return {
    ...data,
    photo_url: safeWebUrl(data.photo_url),
    website_url: safeWebUrl(data.website_url),
    social_handles: publicSocialHandles(data.social_handles),
  };
}), ["public-profile-politician-v1"], CACHE_OPTIONS);

const loadCurrentWeek = unstable_cache(async (): Promise<number> => boundedRead(async (signal) => {
  const { data, error } = await createPublicClient().rpc("current_week_number").abortSignal(signal);
  if (error || typeof data !== "number" || !isValidIsoWeek(data)) throw new Error("Profile reporting period unavailable");
  return data;
}), ["public-profile-week-v1"], CACHE_OPTIONS);

const loadProfile = unstable_cache(async (slug: string, view: ProfileView): Promise<PublicProfileData | null> => {
  const politician = await loadPolitician(slug);
  if (!politician) return null;
  return boundedRead(async (signal) => {
    const supabase = createPublicClient();
    const questionLimit = view.period === "week" ? 50 : 200;
    const cutoff = profilePeriodCutoff(view.period);

    let questionsQuery = supabase.from("questions")
      .select(QUESTION_FIELDS)
      .eq("politician_id", politician.id)
      .eq("status", "active")
      // Public RLS currently permits drafts, so this must be a database filter.
      .eq("answers.is_draft", false)
      .eq("answers.politician_id", politician.id)
      .order("net_upvotes", { ascending: false })
      .order("id", { ascending: true })
      .order("is_ai_generated", { referencedTable: "answers", ascending: true })
      .order("created_at", { referencedTable: "answers", ascending: false })
      .limit(questionLimit)
      .limit(50, { referencedTable: "answers" })
      .limit(24, { referencedTable: "answers.answer_media" });

    // Each aggregate counts question rows. Multiple official answers to one
    // question therefore still contribute exactly one answered question.
    let countsQuery = supabase.from("politicians")
      .select(COUNT_FIELDS)
      .eq("id", politician.id)
      .eq("qualified.status", "active")
      .gte("qualified.net_upvotes", 10)
      .eq("answered.status", "active")
      .gte("answered.net_upvotes", 10)
      .eq("total.status", "active")
      .eq("responded.status", "active");

    for (const relation of ["answered", "responded"]) {
      countsQuery = countsQuery
        .in(`${relation}.official.answer_type`, ["direct", "team_statement"])
        .eq(`${relation}.official.is_ai_generated`, false)
        .eq(`${relation}.official.is_draft`, false)
        .eq(`${relation}.official.politician_id`, politician.id);
    }
    if (view.period === "week") {
      questionsQuery = questionsQuery.eq("week_number", view.viewingWeekNumber);
      for (const relation of ["total", "qualified", "answered", "responded"]) {
        countsQuery = countsQuery.eq(`${relation}.week_number`, view.viewingWeekNumber);
      }
    } else if (cutoff) {
      questionsQuery = questionsQuery.gte("created_at", cutoff);
      for (const relation of ["total", "qualified", "answered", "responded"]) {
        countsQuery = countsQuery.gte(`${relation}.created_at`, cutoff);
      }
    }

    const [questionsResult, countsResult, archiveResult] = await Promise.all([
      questionsQuery.abortSignal(signal),
      countsQuery.abortSignal(signal).single(),
      supabase.from("weekly_snapshots")
        .select("week_number")
        .eq("politician_id", politician.id)
        .lt("week_number", view.currentWeekNumber)
        .order("week_number", { ascending: false })
        .limit(8)
        .abortSignal(signal),
    ]);
    if (questionsResult.error || !questionsResult.data || countsResult.error || !countsResult.data || archiveResult.error || !archiveResult.data) {
      throw new Error("Public profile records unavailable");
    }

    const counts = countsResult.data;
    const totalQuestions = readProfileCount(counts.total);
    const qualifyingQuestions = readProfileCount(counts.qualified);
    const answeredQualifying = readProfileCount(counts.answered);
    const officialAnsweredQuestions = readProfileCount(counts.responded);
    const responseRate = calculateResponseRate(answeredQualifying, qualifyingQuestions);
    if (qualifyingQuestions > totalQuestions || officialAnsweredQuestions > totalQuestions || answeredQualifying > officialAnsweredQuestions) {
      throw new Error("Inconsistent profile counts");
    }

    const questions: ProfileQuestion[] = questionsResult.data.map((question) => {
      const attribution = question.x_posts;
      const attributionUrl = safeWebUrl(attribution?.tweet_url);
      return {
        id: question.id,
        body: question.body,
        net_upvotes: question.net_upvotes,
        is_seeded: question.is_seeded,
        source: question.source,
        status: question.status,
        created_at: question.created_at,
        week_number: question.week_number,
        x_posts: attribution && attributionUrl && /^[A-Za-z0-9_]{1,15}$/.test(attribution.author_handle)
          ? { author_handle: attribution.author_handle, author_name: attribution.author_name, tweet_url: attributionUrl }
          : null,
        answers: toPublicAnswers(question.answers),
      };
    });

    return {
      politician,
      ...view,
      questions,
      totalQuestions,
      qualifyingQuestions,
      answeredQualifying,
      officialAnsweredQuestions,
      responseRate,
      archiveWeeks: [...new Set(archiveResult.data.map((row) => row.week_number).filter(isValidIsoWeek))],
      questionLimit,
    };
  });
}, ["public-profile-record-v1"], CACHE_OPTIONS);

export async function getProfile(slug: string, weekParam?: string, periodParam?: string): Promise<PublicProfileData | null> {
  if (!validSlug(slug)) return null;
  const currentWeekNumber = await loadCurrentWeek();
  const view = resolveProfileView(currentWeekNumber, weekParam, periodParam);
  return loadProfile(slug, view);
}

export async function getProfileMetadata(slug: string): Promise<ProfileMetadata | null> {
  if (!validSlug(slug)) return null;
  const politician = await loadPolitician(slug);
  if (!politician) return null;
  return {
    full_name: politician.full_name,
    office: politician.office,
    state: politician.state,
    party: politician.party,
    photo_url: politician.photo_url,
    bio: politician.bio,
    is_test: politician.is_test,
  };
}
