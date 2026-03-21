/**
 * Seeded Question Generator
 *
 * Generates 10-15 AI-drafted questions for a politician based on their
 * public record. Uses Claude Sonnet. All output labeled:
 * "📋 Suggested Question - AI-generated from public record"
 *
 * Never generates opinion questions or partisan framing.
 * Focuses on: voting record, sponsored bills, committee activity, stated positions.
 */

import { getAnthropicClient, MODEL_GENERATE } from "./client";
import { logAICall, hashPrompt } from "./audit-log";

export interface PoliticianContext {
  id: string;
  full_name: string;
  office: string | null;
  state: string | null;
  party: string | null;
  bio: string | null;
  bioguide_id: string | null;
}

export interface SeededQuestion {
  body: string;
}

interface SeededQuestionsResponse {
  questions: string[];
}

/**
 * Build the politician context string for the prompt.
 * Kept factual — no opinion or characterization.
 */
function buildPoliticianContext(politician: PoliticianContext): string {
  const lines: string[] = [
    `Name: ${politician.full_name}`,
    `Office: ${politician.office ?? "Unknown"}`,
    `State: ${politician.state ?? "Unknown"}`,
    `Party: ${politician.party ?? "Unknown"}`,
  ];
  if (politician.bio) {
    lines.push(`Bio: ${politician.bio.slice(0, 500)}`);
  }
  return lines.join("\n");
}

/**
 * Generate seeded questions for a politician.
 * Returns an empty array (not an error) if ANTHROPIC_API_KEY is missing,
 * so callers can handle the missing-key case gracefully.
 */
export async function generateSeededQuestions(
  politician: PoliticianContext,
  count = 12
): Promise<SeededQuestion[]> {
  const client = getAnthropicClient(); // throws if key not set
  const context = buildPoliticianContext(politician);

  const systemPrompt = `You are a civic accountability assistant. Your job is to generate clear, specific, factual questions that constituents might want their elected official to answer publicly.

RULES:
- Questions must be grounded in the official's public role, voting record, or stated positions
- Never partisan, attacking, or opinion-based
- Each question must be answerable by the official (not rhetorical)
- 10-100 words per question
- Focus on: recent votes, committee work, district priorities, policy positions, constituent services
- Write in second person: "Why did you vote..." or "What is your position on..."
- No profanity, personal attacks, or unverifiable claims
- Do not ask about personal life, health, religion, or family

GOOD EXAMPLES:
- "Why did you vote against the Infrastructure Investment and Jobs Act, and what alternative funding approach would you support?"
- "What is your current position on federal marijuana legalization, given your district's evolving views?"
- "How do you plan to address the staffing shortage at the VA hospital in your district?"

BAD EXAMPLES (never generate these):
- "Why are you so corrupt?" (attacking)
- "Do you think democracy is dying?" (rhetorical/opinion)
- "What do you think about your opponent?" (personal/political)`;

  const userPrompt = `Generate exactly ${count} specific, factual questions for this elected official that constituents would genuinely want answered publicly.

OFFICIAL:
${context}

Return ONLY a JSON object in this exact format (no other text):
{
  "questions": [
    "Question 1 text here?",
    "Question 2 text here?",
    ...
  ]
}`;

  const promptHash = hashPrompt(userPrompt);

  const response = await client.messages.create({
    model: MODEL_GENERATE,
    max_tokens: 2048,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const outputText = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Log to audit table
  await logAICall({
    model: MODEL_GENERATE,
    operation: "seeded_questions",
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    prompt_hash: promptHash,
    related_id: politician.id,
    related_type: "politician",
    result_summary: `Generated ${count} questions for ${politician.full_name}`,
  });

  // Parse JSON response
  let parsed: SeededQuestionsResponse;
  try {
    // Extract JSON block in case model added surrounding text
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found in response");
    parsed = JSON.parse(jsonMatch[0]) as SeededQuestionsResponse;
  } catch {
    throw new Error(`Failed to parse seeded questions response: ${outputText.slice(0, 200)}`);
  }

  if (!Array.isArray(parsed.questions)) {
    throw new Error("Response missing questions array");
  }

  // Validate each question: 10-500 chars, ends with ?
  return parsed.questions
    .filter((q) => typeof q === "string" && q.length >= 10 && q.length <= 500)
    .map((q) => ({ body: q.trim().endsWith("?") ? q.trim() : `${q.trim()}?` }))
    .slice(0, count);
}

/**
 * Deduplication check: is this question semantically similar to existing questions?
 * Uses claude-haiku for speed. Returns true if duplicate (should skip insertion).
 */
export async function isDuplicateQuestion(
  candidateQuestion: string,
  existingQuestions: string[]
): Promise<boolean> {
  if (existingQuestions.length === 0) return false;

  // Fast path: exact substring match
  const lower = candidateQuestion.toLowerCase();
  if (existingQuestions.some((q) => q.toLowerCase().includes(lower.slice(0, 30)))) {
    return true;
  }

  const { getAnthropicClient: getClient, MODEL_CLASSIFY } = await import("./client");
  const client = getClient();

  const prompt = `Is the CANDIDATE question semantically equivalent to any of the EXISTING questions? Answer with only "yes" or "no".

CANDIDATE: "${candidateQuestion}"

EXISTING (check against all):
${existingQuestions.slice(0, 20).map((q, i) => `${i + 1}. "${q}"`).join("\n")}`;

  const response = await client.messages.create({
    model: MODEL_CLASSIFY,
    max_tokens: 10,
    messages: [{ role: "user", content: prompt }],
  });

  const answer = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("")
    .toLowerCase()
    .trim();

  return answer.startsWith("yes");
}
