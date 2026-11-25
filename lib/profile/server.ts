import "server-only";

import { unstable_cache } from "next/cache";
import { createPublicClient } from "@/lib/supabase/server";
import { resolvePoliticianIdentity } from "@/lib/identity/server";
import {
  calculateResponseRate,
  isValidIsoWeek,
  profilePeriodCutoff,
  resolveProfileView,
  safeWebUrl,
  toPublicAnswers,
} from "./helpers";
import type { ProfileMetadata, ProfileQuestion, ProfileView, PublicProfileData, PublicProfilePolitician } from "./types";
import { profileQuestionCacheTag } from "./cache";

const POLITICIAN_FIELDS = "id,slug,full_name,office,state,party,district,bio,photo_url,website_url,social_handles,verification_tier,is_active,is_test,politician_type,is_candidate,candidate_office,candidate_election_year,incumbent_challenge,candidate_status,election_date";
const QUESTION_FIELDS = `id,politician_id,body,net_upvotes,is_seeded,source,status,created_at,week_number,
  x_posts:x_post_id(author_handle,author_name,tweet_url),
  public_answers:answers(id,politician_id,answer_type,body,is_ai_generated,is_draft,ai_confidence,sources,is_disputed,created_at,published_at,
    answer_media(id,media_type,public_url,file_name),
    answer_corrections(id,body,created_at))`;

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
  const client = createPublicClient();
  const { data: source, error } = await client.from("politicians")
    .select("id")
    .eq("slug", slug)
    .abortSignal(signal)
    .maybeSingle();
  if (error) throw new Error("Public profile unavailable");
  if (!source) return null;
  const identity = await resolvePoliticianIdentity(source.id, client);
  if (!identity) return null;
  const { data, error: canonicalError } = await client.from("politicians").select(POLITICIAN_FIELDS)
    .eq("id", identity.canonicalId).abortSignal(signal).single();
  if (canonicalError || !data) throw new Error("Canonical profile unavailable");
  return {
    ...data,
    photo_url: safeWebUrl(data.photo_url),
    website_url: safeWebUrl(data.website_url),
    social_handles: publicSocialHandles(data.social_handles),
  };
}), ["public-profile-politician-identity-v2"], CACHE_OPTIONS);

const loadCurrentWeek = unstable_cache(async (): Promise<number> => boundedRead(async (signal) => {
  const { data, error } = await createPublicClient().rpc("current_week_number").abortSignal(signal);
  if (error || typeof data !== "number" || !isValidIsoWeek(data)) throw new Error("Profile reporting period unavailable");
  return data;
}), ["public-profile-week-v1"], CACHE_OPTIONS);

function loadProfile(politician: PublicProfilePolitician, view: ProfileView, sort: "votes" | "newest" | "unanswered", questionLimit = view.period === "week" ? 50 : 200) {
  return unstable_cache(readProfile, ["public-profile-record-identity-v4"], {
    ...CACHE_OPTIONS,
    tags: [...CACHE_OPTIONS.tags, profileQuestionCacheTag(politician.slug)],
  })(politician, view, sort, questionLimit);
}

async function readProfile(politician: PublicProfilePolitician, view: ProfileView, sort: "votes" | "newest" | "unanswered", questionLimit: number): Promise<PublicProfileData> {
  return boundedRead(async (signal) => {
    const supabase = createPublicClient();
    const identity = await resolvePoliticianIdentity(politician.id, supabase);
    if (!identity || !identity.memberIds.length || identity.memberIds.length > 200) throw new Error("Profile identity unavailable");
    const memberIds = identity.memberIds;
    const cutoff = profilePeriodCutoff(view.period);

    const selected = await supabase.rpc("identity_profile_question_ids", {
      p_id: politician.id, p_period: view.period, p_week: view.viewingWeekNumber,
      p_cutoff: cutoff ?? undefined, p_sort: sort, p_limit: questionLimit,
    }).abortSignal(signal);
    if (selected.error || !Array.isArray(selected.data) || selected.data.length > questionLimit ||
        new Set(selected.data).size !== selected.data.length) throw new Error("Profile question selection unavailable");
    let questionsQuery = supabase.from("questions")
      .select(QUESTION_FIELDS)
      .in("id", selected.data)
      .in("politician_id", memberIds)
      .eq("status", "active")
      // Address both embeds by alias so PostgREST applies media limits only to public answers.
      .eq("public_answers.is_draft", false)
      .in("public_answers.politician_id", memberIds)
      .order("is_ai_generated", { referencedTable: "public_answers", ascending: true })
      .order("created_at", { referencedTable: "public_answers", ascending: false })
      .limit(questionLimit)
      .limit(50, { referencedTable: "public_answers" })
      .limit(24, { referencedTable: "public_answers.answer_media" });
    if (sort !== "newest") questionsQuery = questionsQuery.order("net_upvotes", { ascending: false });
    questionsQuery = questionsQuery.order("created_at", { ascending: false }).order("id", { ascending: true });

    if (view.period === "week") questionsQuery = questionsQuery.eq("week_number", view.viewingWeekNumber);
    else if (cutoff) questionsQuery = questionsQuery.gte("created_at", cutoff);
    const [questionsResult, summaryResult, samplesResult] = await Promise.all([
      questionsQuery.abortSignal(signal),
      supabase.rpc("identity_profile_summary", {
        p_id: politician.id, p_period: view.period, p_week: view.viewingWeekNumber,
        p_cutoff: cutoff ?? undefined,
      }).abortSignal(signal),
      // Seeded questions double as editable sample drafts in the ask box.
      supabase.from("questions").select("id,body")
        .in("politician_id", memberIds).eq("is_seeded", true).eq("status", "active")
        .order("net_upvotes", { ascending: false }).order("created_at", { ascending: false }).limit(3)
        .abortSignal(signal),
    ]);
    if (questionsResult.error || !questionsResult.data || summaryResult.error || !summaryResult.data ||
        typeof summaryResult.data !== "object" || Array.isArray(summaryResult.data)) throw new Error("Public profile records unavailable");
    const sampleQuestions = (samplesResult.error ? [] : samplesResult.data ?? [])
      .filter((row) => typeof row.body === "string" && row.body.trim().length > 0)
      .map((row) => ({ id: row.id, body: row.body }));
    const summary = summaryResult.data as Record<string, unknown>;
    const count = (key: string): number => {
      const value = summary[key];
      if (typeof value !== "number" || !Number.isSafeInteger(value) || value < 0) throw new Error("Invalid identity profile count");
      return value;
    };
    const totalQuestions = count("total_questions");
    const qualifyingQuestions = count("qualifying_questions");
    const answeredQualifying = count("answered_qualifying");
    const officialAnsweredQuestions = count("answered_questions");
    const responseRate = calculateResponseRate(answeredQualifying, qualifyingQuestions);
    if (qualifyingQuestions > totalQuestions || officialAnsweredQuestions > totalQuestions || answeredQualifying > officialAnsweredQuestions ||
        !Array.isArray(summary.history)) throw new Error("Inconsistent identity profile summary");
    const archiveWeeks = summary.history.map((row: { week_number?: unknown }) => row.week_number)
      .filter((week): week is number => typeof week === "number" && isValidIsoWeek(week));

    const questions: ProfileQuestion[] = questionsResult.data.map((question) => {
      const attribution = question.x_posts;
      const attributionUrl = safeWebUrl(attribution?.tweet_url);
      return {
        id: question.id,
        politician_id: question.politician_id,
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
        answers: toPublicAnswers(question.public_answers.filter(answer => answer.politician_id === question.politician_id)),
      };
    });

    return {
      politician,
      memberIds,
      ...view,
      questions,
      totalQuestions,
      qualifyingQuestions,
      answeredQualifying,
      officialAnsweredQuestions,
      responseRate,
      archiveWeeks,
      questionLimit,
      sampleQuestions,
    };
  });
}

export async function getProfile(slug: string, weekParam?: string, periodParam?: string, sort: "votes" | "newest" | "unanswered" = "votes"): Promise<PublicProfileData | null> {
  if (!validSlug(slug)) return null;
  const currentWeekNumber = await loadCurrentWeek();
  const view = resolveProfileView(currentWeekNumber, weekParam, periodParam);
  const politician = await loadPolitician(slug);
  if (!politician) return null;
  const profile = await loadProfile(politician, view, sort);
  const latestQuestion = !view.isHistoricalView && view.period !== "all" &&
    sort !== "unanswered" && profile.questions.length === 0
    ? (await loadProfile(politician, { ...view, period: "all" }, "newest", 1)).questions[0]
    : undefined;
  return { ...profile, latestQuestion };
}

export async function getProfileMetadata(slug: string): Promise<ProfileMetadata | null> {
  if (!validSlug(slug)) return null;
  const politician = await loadPolitician(slug);
  if (!politician) return null;
  return {
    slug: politician.slug,
    full_name: politician.full_name,
    office: politician.office,
    state: politician.state,
    party: politician.party,
    photo_url: politician.photo_url,
    bio: politician.bio,
    is_active: politician.is_active,
    is_test: politician.is_test,
  };
}
