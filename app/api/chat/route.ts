/**
 * /api/chat — WhyTho chatbot streaming endpoint
 *
 * Uses Vercel AI SDK + Anthropic provider.
 * Claude uses tools to fetch real DB data — no hallucination.
 * Anonymous users are supported (Supabase anon auth).
 */

import { streamText, tool } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { buildSystemPrompt } from "@/lib/ai/chatbot-prompt";
import { containsProfanity } from "@/lib/moderation/filter";

const MAX_QUESTION_LENGTH = 500;
const MIN_QUESTION_LENGTH = 10;
const MAX_POLITICIAN_TARGETS = 5;

export async function POST(req: Request) {
  const { messages, pageContext } = (await req.json()) as {
    messages: { role: string; content: string }[];
    pageContext?: string | null;
  };

  // Get current user (anon is fine)
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const userId = user?.id ?? null;

  const admin = createAdminClient();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: buildSystemPrompt(pageContext),
    messages: messages as Parameters<typeof streamText>[0]["messages"],
    maxSteps: 6,
    tools: {
      // ── Search for politicians by name, state, office ────────────────────
      search_politicians: tool({
        description:
          "Search for politicians by name, state, or office. Returns matching profiles with id, name, slug, office, and state.",
        parameters: z.object({
          query: z.string().describe("Name or partial name to search for"),
          state: z.string().optional().describe("Two-letter state code to filter by, e.g. CO"),
          office: z.string().optional().describe("Office type to filter by, e.g. Senator, Representative"),
        }),
        execute: async ({ query, state, office }) => {
          let q = admin
            .from("politicians")
            .select("id, full_name, slug, office, state, verification_tier, party")
            .eq("is_active", true)
            .ilike("full_name", `%${query}%`)
            .limit(8);

          if (state) q = q.eq("state", state.toUpperCase());
          if (office) q = q.ilike("office", `%${office}%`);

          const { data, error } = await q;
          if (error) return { error: "Search failed. Please try again." };
          if (!data || data.length === 0) return { results: [], message: "No politicians found matching that search." };
          return { results: data };
        },
      }),

      // ── Fetch questions + answers for a politician ───────────────────────
      get_politician_qa: tool({
        description:
          "Fetch the questions a politician has been asked and their answers. Returns raw data from the database only. Use this before summarizing any politician's record.",
        parameters: z.object({
          politician_id: z.string().describe("The UUID of the politician"),
          politician_name: z.string().describe("The politician's name (for display)"),
          period: z
            .enum(["week", "month", "all"])
            .optional()
            .default("all")
            .describe("Time period to fetch questions for"),
          limit: z.number().optional().default(20).describe("Max questions to return"),
        }),
        execute: async ({ politician_id, period, limit }) => {
          const admin2 = createAdminClient();

          // Build time filter
          let since: string | null = null;
          if (period === "week") {
            const { data: weekData } = await admin2.rpc("current_week_number");
            const weekNum = weekData as number;
            // Get questions from current week only
            const { data: questions } = await admin2
              .from("questions")
              .select(`
                id, body, net_upvotes, week_number, is_seeded, created_at,
                answers (id, body, answer_type, is_ai_generated, ai_confidence, created_at)
              `)
              .eq("politician_id", politician_id)
              .eq("status", "active")
              .eq("week_number", weekNum)
              .order("net_upvotes", { ascending: false })
              .limit(limit);

            return buildQAResult(questions, period);
          } else if (period === "month") {
            since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          }

          const query = admin2
            .from("questions")
            .select(`
              id, body, net_upvotes, week_number, is_seeded, created_at,
              answers (id, body, answer_type, is_ai_generated, ai_confidence, created_at)
            `)
            .eq("politician_id", politician_id)
            .eq("status", "active")
            .order("net_upvotes", { ascending: false })
            .limit(limit);

          const { data: questions } = since
            ? await query.gte("created_at", since)
            : await query;

          return buildQAResult(questions, period ?? "all");
        },
      }),

      // ── Site-wide analytics ──────────────────────────────────────────────
      query_site_stats: tool({
        description:
          "Query site-wide statistics. Use for questions like 'who answers the most questions', 'who has the highest response rate', 'how many questions were asked this week', etc.",
        parameters: z.object({
          stat_type: z
            .enum([
              "most_answered",
              "most_questions",
              "response_rate_leaders",
              "platform_overview",
              "by_state",
            ])
            .describe("The type of stat to query"),
          state: z
            .string()
            .optional()
            .describe("Filter by state code (for by_state or filtering most_answered/most_questions)"),
          office: z.string().optional().describe("Filter by office type"),
          limit: z.number().optional().default(10),
        }),
        execute: async ({ stat_type, state, office, limit }) => {
          const admin2 = createAdminClient();

          if (stat_type === "platform_overview") {
            const [
              { count: totalPoliticians },
              { count: totalQuestions },
              { count: totalAnswers },
              { count: totalVotes },
              { data: weekData },
            ] = await Promise.all([
              admin2.from("politicians").select("*", { count: "exact", head: true }).eq("is_active", true),
              admin2.from("questions").select("*", { count: "exact", head: true }).eq("status", "active"),
              admin2.from("answers").select("*", { count: "exact", head: true }).eq("is_ai_generated", false),
              admin2.from("votes").select("*", { count: "exact", head: true }),
              admin2.rpc("current_week_number"),
            ]);
            return {
              total_politicians: totalPoliticians,
              total_questions: totalQuestions,
              official_answers: totalAnswers,
              total_votes: totalVotes,
              current_week: weekData,
            };
          }

          if (stat_type === "most_answered") {
            let q = admin2
              .from("politicians")
              .select("full_name, slug, office, state, party")
              .eq("is_active", true)
              .order("full_name")
              .limit(limit);
            if (state) q = q.eq("state", state.toUpperCase());
            if (office) q = q.ilike("office", `%${office}%`);
            // Get politicians with answered questions count
            const { data } = await q;
            // Enrich with answer counts
            const enriched = await Promise.all(
              (data ?? []).map(async (p) => {
                const { count } = await admin2
                  .from("answers")
                  .select("*", { count: "exact", head: true })
                  .eq("politician_id", (p as { id?: string } & typeof p).id ?? "")
                  .eq("is_ai_generated", false);
                return { ...p, answer_count: count ?? 0 };
              })
            );
            return {
              results: enriched.sort((a, b) => b.answer_count - a.answer_count).slice(0, limit),
            };
          }

          if (stat_type === "most_questions") {
            let q = admin2
              .from("questions")
              .select("politician_id, politicians!politician_id(full_name, slug, office, state, party)")
              .eq("status", "active");
            const { data } = await q;
            // Tally by politician
            const tally: Record<string, { count: number; politician: unknown }> = {};
            for (const row of data ?? []) {
              const pid = row.politician_id;
              if (!tally[pid]) tally[pid] = { count: 0, politician: row.politicians };
              tally[pid].count++;
            }
            const sorted = Object.values(tally)
              .sort((a, b) => b.count - a.count)
              .slice(0, limit)
              .map(({ count, politician }) => ({ ...(politician as object), question_count: count }));
            return { results: sorted };
          }

          if (stat_type === "response_rate_leaders") {
            const { data } = await admin2
              .from("politicians")
              .select("id, full_name, slug, office, state, party")
              .eq("is_active", true)
              .limit(50);

            const enriched = await Promise.all(
              (data ?? []).map(async (p) => {
                const { data: rateData } = await admin2.rpc("participation_rate_period", {
                  p_politician_id: p.id,
                  p_period: "all",
                });
                return { ...p, response_rate: rateData ?? 0 };
              })
            );
            return {
              results: enriched
                .filter((p) => p.response_rate > 0)
                .sort((a, b) => b.response_rate - a.response_rate)
                .slice(0, limit),
            };
          }

          if (stat_type === "by_state") {
            const { data } = await admin2
              .from("politicians")
              .select("state, id")
              .eq("is_active", true);
            const stateCounts: Record<string, number> = {};
            for (const p of data ?? []) {
              if (p.state) stateCounts[p.state] = (stateCounts[p.state] ?? 0) + 1;
            }
            return {
              results: Object.entries(stateCounts)
                .map(([state, count]) => ({ state, politician_count: count }))
                .sort((a, b) => b.politician_count - a.politician_count),
            };
          }

          return { error: "Unknown stat_type" };
        },
      }),

      // ── Search the FAQ knowledge base ────────────────────────────────────
      search_knowledge_base: tool({
        description:
          "Search the WhyTho FAQ and team-answered questions knowledge base. Call this before answering any question about how WhyTho works.",
        parameters: z.object({
          query: z.string().describe("The question or topic to search for"),
        }),
        execute: async ({ query }) => {
          const admin2 = createAdminClient();
          const { data } = await admin2
            .from("chatbot_knowledge")
            .select("question, answer, category")
            .or(`question.ilike.%${query}%,answer.ilike.%${query}%`)
            .limit(5);

          if (!data || data.length === 0) {
            return { results: [], message: "No matching entries in knowledge base." };
          }
          return { results: data };
        },
      }),

      // ── Post a question to politician page(s) ────────────────────────────
      post_question: tool({
        description:
          "Post a question to one or more politician pages on behalf of the user. Requires politician IDs (get them from search_politicians first). Max 5 politicians per call.",
        parameters: z.object({
          question: z.string().describe("The question text to post"),
          politician_ids: z
            .array(z.string())
            .min(1)
            .max(MAX_POLITICIAN_TARGETS)
            .describe("Array of politician UUIDs to post the question to (max 5)"),
          politician_names: z
            .array(z.string())
            .describe("Matching array of politician names (for confirmation messaging)"),
        }),
        execute: async ({ question, politician_ids, politician_names }) => {
          // Validate question
          const trimmed = question.trim();
          if (trimmed.length < MIN_QUESTION_LENGTH) {
            return { error: `Question must be at least ${MIN_QUESTION_LENGTH} characters.` };
          }
          if (trimmed.length > MAX_QUESTION_LENGTH) {
            return { error: `Question must be at most ${MAX_QUESTION_LENGTH} characters.` };
          }
          if (containsProfanity(trimmed)) {
            return { error: "Question contains inappropriate language. Please revise." };
          }

          const admin2 = createAdminClient();
          const { data: weekData } = await admin2.rpc("current_week_number");
          const week_number = weekData as number;

          const posted: string[] = [];
          const failed: string[] = [];

          for (let i = 0; i < politician_ids.length; i++) {
            const politician_id = politician_ids[i]!;
            const name = politician_names[i] ?? politician_id;

            // Verify politician exists
            const { data: politician } = await admin2
              .from("politicians")
              .select("id")
              .eq("id", politician_id)
              .eq("is_active", true)
              .single();

            if (!politician) {
              failed.push(name);
              continue;
            }

            const { error } = await admin2.from("questions").insert({
              politician_id: politician_id,
              body: trimmed,
              submitted_by: userId,
              week_number,
              is_seeded: false,
              status: "active" as const,
              source: "chatbot",
            });

            if (error) {
              failed.push(name);
            } else {
              posted.push(name);
            }
          }

          // Instrumentation log
          if (posted.length > 0) {
            await admin2.from("chatbot_question_posts").insert({
              user_id: userId,
              question_text: trimmed,
              politician_ids: politician_ids.slice(0, posted.length),
              question_ids: [],
            });
          }

          return {
            posted,
            failed,
            message:
              posted.length > 0
                ? `Posted your question to: ${posted.join(", ")}.${failed.length > 0 ? ` Failed for: ${failed.join(", ")}.` : ""}`
                : "Failed to post the question. Please try again.",
          };
        },
      }),

      // ── Log user feedback ─────────────────────────────────────────────────
      log_feedback: tool({
        description:
          "Log user feedback or a product improvement suggestion. Use when the user says something like 'you should add...', 'it would be great if...', 'I found a bug...', or is expressing a complaint or suggestion.",
        parameters: z.object({
          message: z.string().describe("The user's feedback verbatim"),
          category: z
            .enum(["bug", "feature", "ux", "content", "other"])
            .describe("Category of feedback"),
          priority: z
            .number()
            .min(1)
            .max(5)
            .describe("Priority 1-5 (5=urgent). Base on impact and sentiment."),
        }),
        execute: async ({ message, category, priority }) => {
          const admin2 = createAdminClient();
          await admin2.from("chatbot_feedback").insert({
            user_id: userId,
            raw_message: message,
            category,
            priority,
            status: "new",
          });
          return { logged: true };
        },
      }),

      // ── Forward unknown question to WhyTho team ──────────────────────────
      forward_to_team: tool({
        description:
          "Forward a question to the WhyTho team when you cannot answer it. Use as a last resort after exhausting search_knowledge_base.",
        parameters: z.object({
          question: z.string().describe("The user's question verbatim"),
          user_email: z
            .string()
            .optional()
            .describe("User's email if they want a follow-up response"),
        }),
        execute: async ({ question, user_email }) => {
          const admin2 = createAdminClient();
          await admin2.from("chatbot_forwarded").insert({
            user_id: userId,
            user_email: user_email ?? null,
            question,
          });
          return { forwarded: true };
        },
      }),
    },
  });

  return result.toDataStreamResponse();
}

// ── Helpers ────────────────────────────────────────────────────────────────────

type QuestionRow = {
  id: string;
  body: string;
  net_upvotes: number;
  week_number: number;
  is_seeded: boolean;
  created_at: string;
  answers: {
    id: string;
    body: string;
    answer_type: string;
    is_ai_generated: boolean;
    ai_confidence: string | null;
    created_at: string;
  }[];
} | null;

function buildQAResult(questions: QuestionRow[] | null, period: string) {
  if (!questions || questions.length === 0) {
    return {
      questions: [],
      message: `No questions found for this politician in the ${period} period.`,
    };
  }

  const answered = questions.filter((q) => q && q.answers && q.answers.length > 0);
  const unanswered = questions.filter((q) => q && (!q.answers || q.answers.length === 0));

  return {
    period,
    total_questions: questions.length,
    answered_count: answered.length,
    unanswered_count: unanswered.length,
    questions: questions.map((q) => ({
      id: q?.id,
      question: q?.body,
      upvotes: q?.net_upvotes,
      is_seeded: q?.is_seeded,
      week: q?.week_number,
      answers: (q?.answers ?? []).map((a) => ({
        id: a.id,
        body: a.body,
        type: a.answer_type,
        is_ai_generated: a.is_ai_generated,
        confidence: a.ai_confidence,
      })),
    })),
  };
}
