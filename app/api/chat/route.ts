/**
 * /api/chat — WhyTho chatbot streaming endpoint
 *
 * Uses Vercel AI SDK + Anthropic provider.
 * Tools retrieve public database records; unsupported claims must be declined.
 * Anonymous users are supported (Supabase anon auth).
 */

import { streamText, tool, stepCountIs } from "ai";
import { anthropic } from "@ai-sdk/anthropic";
import { z } from "zod";
import { createClient, createAdminClient, createPublicClient } from "@/lib/supabase/server";
import { buildSystemPrompt } from "@/lib/ai/chatbot-prompt";
import { boundedJson } from "@/lib/security/bounded-json";
import { parseChatRequest } from "@/lib/security/chat-input";
import { durableRateLimit, rateLimitKey } from "@/lib/security/durable-rate-limit";
import { rateLimit, clientIp } from "@/lib/rate-limit";

// Cost controls. This endpoint runs claude-sonnet-4-6 with tool calling, so an
// unauthenticated, unmetered caller could run up an unbounded Anthropic bill.
const CHAT_PER_USER_LIMIT = 12;
const CHAT_PER_USER_WINDOW_MS = 5 * 60 * 1000;
const CHAT_PER_IP_LIMIT = 30;
const CHAT_PER_IP_WINDOW_MS = 5 * 60 * 1000;
/** Caps the context resent on each turn, which is what actually drives token spend. */
const MAX_MESSAGES_PER_REQUEST = 40;


export async function POST(req: Request) {
  const parsed = parseChatRequest(await boundedJson(req));
  if (!parsed) return Response.json({ error: "Invalid or oversized conversation." }, { status: 400 });
  const { messages, pageContext } = parsed;

  // A session is required. Anonymous accounts are fine, and /api/auth/anonymous
  // is itself IP rate limited, so this forces callers through a metered door
  // rather than leaving a paid model endpoint open to the internet.
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return Response.json(
      { error: "Sign in to use the assistant." },
      { status: 401 }
    );
  }
  const userId = user.id;

  const ip = clientIp(req);
  const perIp = rateLimit(`chat:ip:${ip}`, CHAT_PER_IP_LIMIT, CHAT_PER_IP_WINDOW_MS);
  const perUser = rateLimit(
    `chat:user:${userId}`,
    CHAT_PER_USER_LIMIT,
    CHAT_PER_USER_WINDOW_MS
  );

  if (!perIp.allowed || !perUser.allowed) {
    const retryAfter = Math.max(perIp.retryAfterSeconds, perUser.retryAfterSeconds);
    return Response.json(
      { error: "Too many messages. Please wait a moment and try again." },
      { status: 429, headers: { "Retry-After": String(retryAfter) } }
    );
  }

  if (!Array.isArray(messages) || messages.length === 0) {
    return Response.json({ error: "No messages provided." }, { status: 400 });
  }
  if (messages.length > MAX_MESSAGES_PER_REQUEST) {
    return Response.json(
      { error: "Conversation too long. Please start a new chat." },
      { status: 413 }
    );
  }

  const sharedLimit = await durableRateLimit(rateLimitKey("chat-user",userId),12,300);
  if (sharedLimit !== "allowed") return Response.json({error: sharedLimit === "limited" ? "Please wait before sending another message." : "The assistant is temporarily unavailable."}, {status: sharedLimit === "limited" ? 429 : 503});
  const sharedIpLimit = await durableRateLimit(rateLimitKey("chat-ip",ip),30,300);
  if (sharedIpLimit !== "allowed") return Response.json({ error: "The assistant is temporarily unavailable. Please try later." }, { status: sharedIpLimit === "limited" ? 429 : 503 });
  const publicData = createPublicClient();

  const result = streamText({
    model: anthropic("claude-sonnet-4-6"),
    system: buildSystemPrompt(pageContext),
    messages,
    stopWhen: stepCountIs(4),
    maxOutputTokens: 1500,
    tools: {
      // ── Search for politicians by name, state, office ────────────────────
      search_politicians: tool({
        description:
          "Search for politicians by name, state, or office. Returns matching profiles with id, name, slug, office, and state.",
        inputSchema: z.object({
          query: z.string().max(200).describe("Name or partial name to search for"),
          state: z.string().regex(/^[a-zA-Z]{2}$/).optional().describe("Two-letter state code to filter by, e.g. CO"),
          office: z.string().max(100).optional().describe("Office type to filter by, e.g. Senator, Representative"),
        }),
        execute: async ({ query, state, office }) => {
          let q = publicData
            .from("politicians")
            .select("id, full_name, slug, office, state, verification_tier, party")
            .eq("is_active", true).eq("is_test", false)
            .ilike("full_name", `%${query.replace(/[%_]/g, "")}%`)
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
        inputSchema: z.object({
          politician_id: z.string().uuid().describe("The UUID of the politician"),
          politician_name: z.string().describe("The politician's name (for display)"),
          period: z
            .enum(["week", "month", "all"])
            .optional()
            .default("all")
            .describe("Time period to fetch questions for"),
          limit: z.number().int().min(1).max(20).optional().default(20).describe("Max questions to return"),
        }),
        execute: async ({ politician_id, period, limit }) => {
          const admin2 = createPublicClient();

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
                answers (id, body, answer_type, is_ai_generated, is_draft, ai_confidence, created_at)
              `)
              .eq("politician_id", politician_id)
              .eq("answers.is_draft", false)
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
              answers (id, body, answer_type, is_ai_generated, is_draft, ai_confidence, created_at)
            `)
            .eq("politician_id", politician_id)
              .eq("answers.is_draft", false)
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
        inputSchema: z.object({
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
          office: z.string().max(100).optional().describe("Filter by office type"),
          limit: z.number().int().min(1).max(20).optional().default(10),
        }),
        execute: async ({ stat_type, state, office, limit }) => {
          const admin2 = createPublicClient();

          if (stat_type === "platform_overview") {
            const [
              { count: totalPoliticians },
              { count: totalQuestions },
              { count: totalAnswers },
              { data: weekData },
            ] = await Promise.all([
              admin2.from("politicians").select("*", { count: "exact", head: true }).eq("is_active", true).eq("is_test", false),
              admin2.from("questions").select("*", { count: "exact", head: true }).eq("status", "active"),
              admin2.from("answers").select("*", { count: "exact", head: true }).eq("is_ai_generated", false).eq("is_draft", false).in("answer_type", ["direct", "team_statement"]),
              admin2.rpc("current_week_number"),
            ]);
            return {
              total_politicians: totalPoliticians,
              total_questions: totalQuestions,
              official_answers: totalAnswers,
              current_week: weekData,
            };
          }

          // A limited sample is not a site-wide ranking. The public leaderboard
          // owns its complete aggregate methodology and reporting window.
          if (["most_answered", "most_questions", "response_rate_leaders", "by_state"].includes(stat_type)) {
            return { available: false, message: "This chat tool cannot verify a complete ranking. Open the public leaderboard and select the reporting period.", url: "https://whytho.us/leaderboard", filters: { state, office, limit } };
          }

          return { error: "Unknown stat_type" };
        },
      }),

      // ── Search the FAQ knowledge base ────────────────────────────────────
      search_knowledge_base: tool({
        description:
          "Search the WhyTho FAQ and team-answered questions knowledge base. Call this before answering any question about how WhyTho works.",
        inputSchema: z.object({
          query: z.string().max(200).describe("The question or topic to search for"),
        }),
        execute: async ({ query }) => {
          const admin2 = createAdminClient();
          const { data } = await admin2
            .from("chatbot_knowledge")
            .select("question, answer, category")
            .ilike("question", `%${query.replace(/[%_]/g, "").slice(0,200)}%`)
            .limit(5);

          if (!data || data.length === 0) {
            return { results: [], message: "No matching entries in knowledge base." };
          }
          return { results: data };
        },
      }),

      // Publication requires the normal form's review, bot check and daily quota.
      prepare_question: tool({
        description: "Help prepare a question. The user must review and submit it on the politician profile; this tool does not publish.",
        inputSchema: z.object({ question: z.string().min(10).max(500), politician_slug: z.string().regex(/^[a-z0-9-]+$/).max(160) }),
        execute: async ({ question, politician_slug }) => ({ draft: question, profile_url: `https://whytho.us/${politician_slug}`, published: false, message: "Open this profile and use Ask a question to review and submit your question." }),
      }),

      // ── Log user feedback ─────────────────────────────────────────────────
      log_feedback: tool({
        description:
          "Log user feedback or a product improvement suggestion. Use when the user says something like 'you should add...', 'it would be great if...', 'I found a bug...', or is expressing a complaint or suggestion.",
        inputSchema: z.object({
          message: z.string().min(1).max(4000).describe("The user's feedback verbatim"),
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
        inputSchema: z.object({
          question: z.string().min(1).max(4000).describe("The user's question verbatim"),
          user_email: z
            .string().email().max(254)
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

  return result.toTextStreamResponse();
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
    is_draft: boolean;
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

  const official = (q: QuestionRow) => q?.answers?.some(a => !a.is_draft && !a.is_ai_generated && ["direct", "team_statement"].includes(a.answer_type)) ?? false;
  const answered = questions.filter(official);
  const unanswered = questions.filter(q => !official(q));

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
      answers: (q?.answers ?? []).filter(a => !a.is_draft).map((a) => ({
        id: a.id,
        body: a.body,
        type: a.answer_type,
        is_ai_generated: a.is_ai_generated,
        confidence: a.ai_confidence,
      })),
    })),
  };
}
