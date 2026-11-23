/**
 * GET /api/og/answer/[id]
 *
 * Returns a PNG card for sharing an answer on social media.
 * Public records only. Attachments stay on their controlled delivery route.
 */

import { ImageResponse } from "next/og";
import { createPublicClient } from "@/lib/supabase/server";

export const runtime = "edge";
export const dynamic = "force-dynamic";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const supabase = createPublicClient();

  // Fetch answer + politician + question
  const { data: answer } = await supabase
    .from("answers")
    .select(`
      id,
      body,
      created_at,
      politician_id,
      politicians ( full_name, office, state ),
      question_id
    `)
    .eq("id", id)
    .eq("is_draft", false)
    .maybeSingle();

  if (!answer) {
    return new Response("Answer not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const politician = Array.isArray(answer.politicians)
    ? answer.politicians[0]
    : answer.politicians;

  // Fetch question body
  const { data: question } = answer.question_id
    ? await supabase
        .from("questions")
        .select("body, status")
        .eq("id", answer.question_id)
        .maybeSingle()
    : { data: null };

  if (!question || question.status === "removed") {
    return new Response("Answer not found", { status: 404, headers: { "Cache-Control": "no-store" } });
  }

  const politicianName = politician?.full_name ?? "Politician";
  const office = politician?.office ?? "";
  const state = politician?.state ?? "";
  const questionBody = question.body ?? "";
  const answerBody = answer.body ?? "";

  const truncate = (s: string, n: number) =>
    s.length > n ? s.slice(0, n) + "…" : s;

  return new ImageResponse(
    (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: "100%",
          height: "100%",
          background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {/* Content */}
        <div
          style={{
            position: "relative",
            display: "flex",
            flexDirection: "column",
            padding: "40px 48px",
            height: "100%",
            gap: "20px",
          }}
        >
          {/* WhyTho badge */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "8px",
            }}
          >
            <div
              style={{
                background: "#e11d48",
                borderRadius: "6px",
                padding: "4px 10px",
                color: "white",
                fontSize: "13px",
                fontWeight: 700,
                letterSpacing: "0.05em",
              }}
            >
              WhyTho
            </div>
            <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px" }}>
              ✓ Official Response
            </span>
          </div>

          {/* Question */}
          {questionBody && (
            <div
              style={{
                background: "rgba(255,255,255,0.08)",
                borderRadius: "10px",
                padding: "14px 18px",
                borderLeft: "3px solid rgba(255,255,255,0.3)",
              }}
            >
              <p
                style={{
                  color: "rgba(255,255,255,0.7)",
                  fontSize: "15px",
                  margin: 0,
                  lineHeight: 1.4,
                }}
              >
                &quot;{truncate(questionBody, 120)}&quot;
              </p>
            </div>
          )}

          {/* Answer */}
          <div style={{ flex: 1, display: "flex", alignItems: "flex-start" }}>
            <p
              style={{
                color: "white",
                fontSize: "20px",
                lineHeight: 1.5,
                margin: 0,
                fontWeight: 400,
              }}
            >
              {truncate(answerBody, 240)}
            </p>
          </div>

          {/* Footer */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderTop: "1px solid rgba(255,255,255,0.15)",
              paddingTop: "16px",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
              <span style={{ color: "white", fontSize: "17px", fontWeight: 700 }}>
                {politicianName}
              </span>
              {(office || state) && (
                <span style={{ color: "rgba(255,255,255,0.6)", fontSize: "13px" }}>
                  {[office, state].filter(Boolean).join(" · ")}
                </span>
              )}
            </div>
            <span style={{ color: "rgba(255,255,255,0.5)", fontSize: "13px" }}>
              whytho.us
            </span>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
