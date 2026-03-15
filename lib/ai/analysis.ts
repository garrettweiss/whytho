/**
 * AI Analysis Generator
 *
 * Generates an analysis of a politician's public record in response to a
 * constituent question. Uses Claude Sonnet with strict guardrails.
 *
 * PRODUCT RULES (non-negotiable):
 * - NEVER label as from the politician
 * - Always display: "🤖 AI Analysis of Public Record. This is NOT a statement from [Politician]"
 * - Confidence levels: high (3+ sources), medium (1-2), low (inference), insufficient
 * - If insufficient: return { insufficientRecord: true } — NEVER fabricate
 * - All sources must include URL + date
 * - Full audit log retained indefinitely
 */

import { getAnthropicClient, MODEL_GENERATE } from "./client";
import { logAICall, hashPrompt } from "./audit-log";

export type ConfidenceLevel = "high" | "medium" | "low" | "insufficient";

export interface AnalysisSource {
  title: string;
  url: string;
  date: string; // YYYY-MM-DD
}

export type AnalysisResult =
  | {
      insufficientRecord: true;
      confidence: "insufficient";
    }
  | {
      insufficientRecord: false;
      confidence: Exclude<ConfidenceLevel, "insufficient">;
      body: string;
      sources: AnalysisSource[];
    };

export interface AnalysisInput {
  politicianId: string;
  politicianName: string;
  office: string | null;
  state: string | null;
  party: string | null;
  bio: string | null;
  question: string;
}

const SYSTEM_PROMPT = `You are a non-partisan civic research assistant. Your job is to analyze a politician's verifiable public record to help constituents understand how their representative has acted on a given issue.

STRICT RULES:
1. Only cite verifiable, public information — voting records, official statements, sponsored legislation, committee votes, public speeches
2. If you cannot find at least 1 credible public source, return { "insufficientRecord": true }
3. Never speculate, infer opinions, or characterize motives
4. Never generate content that cannot be directly attributed to a public source
5. This analysis is NOT a statement from the politician — it is a summary of their public record
6. Always include specific source URLs and dates
7. Confidence: "high" = 3+ primary sources, "medium" = 1-2 sources, "low" = indirect/inferred, "insufficient" = cannot verify

NOTE ON SOURCES: You have knowledge up to your training cutoff. Cite known congressional votes (congress.gov), official .gov statements, C-SPAN records, FEC filings, and major news sources with dates. If you cannot cite at least one specific, verifiable source with a URL and date, return insufficientRecord.`;

function buildAnalysisPrompt(input: AnalysisInput): string {
  return `Analyze ${input.politicianName}'s public record in response to this constituent question.

POLITICIAN:
Name: ${input.politicianName}
Office: ${input.office ?? "Unknown"}
State: ${input.state ?? "Unknown"}
Party: ${input.party ?? "Unknown"}
${input.bio ? `Bio: ${input.bio.slice(0, 300)}` : ""}

QUESTION FROM CONSTITUENT:
"${input.question}"

Respond ONLY with a JSON object in this exact format (no other text):

If you have verifiable public record:
{
  "insufficientRecord": false,
  "confidence": "high" | "medium" | "low",
  "body": "2-4 paragraph analysis citing specific votes, statements, or legislation. Be factual and precise. Do not editorialize.",
  "sources": [
    {
      "title": "Specific bill name, vote record, or statement title",
      "url": "https://congress.gov/... or other verifiable URL",
      "date": "YYYY-MM-DD"
    }
  ]
}

If you cannot find verifiable public record:
{
  "insufficientRecord": true
}`;
}

/**
 * Generate AI analysis of a politician's public record for a given question.
 * Returns { insufficientRecord: true } when evidence is lacking — never fabricates.
 */
export async function generateAnalysis(input: AnalysisInput): Promise<AnalysisResult> {
  const client = getAnthropicClient();
  const prompt = buildAnalysisPrompt(input);
  const promptHash = hashPrompt(prompt);

  const response = await client.messages.create({
    model: MODEL_GENERATE,
    max_tokens: 2048,
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: prompt }],
  });

  const outputText = response.content
    .filter((b) => b.type === "text")
    .map((b) => (b as { type: "text"; text: string }).text)
    .join("");

  // Log every call — non-negotiable
  await logAICall({
    model: MODEL_GENERATE,
    operation: "ai_analysis",
    input_tokens: response.usage.input_tokens,
    output_tokens: response.usage.output_tokens,
    prompt_hash: promptHash,
    related_id: input.politicianId,
    related_type: "politician",
    result_summary: `Analysis for: "${input.question.slice(0, 80)}"`,
  });

  // Parse response
  let parsed: {
    insufficientRecord?: boolean;
    confidence?: string;
    body?: string;
    sources?: Array<{ title?: string; url?: string; date?: string }>;
  };

  try {
    const jsonMatch = outputText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON found");
    parsed = JSON.parse(jsonMatch[0]);
  } catch {
    // If parsing fails, treat as insufficient — never show a malformed response
    return { insufficientRecord: true, confidence: "insufficient" };
  }

  if (parsed.insufficientRecord === true) {
    return { insufficientRecord: true, confidence: "insufficient" };
  }

  // Validate confidence level
  const confidence = parsed.confidence as ConfidenceLevel;
  if (!["high", "medium", "low"].includes(confidence)) {
    return { insufficientRecord: true, confidence: "insufficient" };
  }

  // Validate body
  const body = typeof parsed.body === "string" ? parsed.body.trim() : "";
  if (body.length < 50) {
    return { insufficientRecord: true, confidence: "insufficient" };
  }

  // Validate and clean sources
  const sources: AnalysisSource[] = (parsed.sources ?? [])
    .filter(
      (s) =>
        s &&
        typeof s.title === "string" &&
        typeof s.url === "string" &&
        typeof s.date === "string" &&
        s.url.startsWith("http")
    )
    .map((s) => ({
      title: (s.title ?? "").trim(),
      url: (s.url ?? "").trim(),
      date: (s.date ?? "").trim(),
    }));

  // If claimed high/medium but no sources, downgrade
  const finalConfidence: Exclude<ConfidenceLevel, "insufficient"> =
    sources.length === 0
      ? "low"
      : sources.length >= 3
        ? "high"
        : sources.length >= 1
          ? "medium"
          : "low";

  return {
    insufficientRecord: false,
    confidence: finalConfidence,
    body,
    sources,
  };
}
