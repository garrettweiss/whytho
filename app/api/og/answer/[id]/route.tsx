/**
 * GET /api/og/answer/[id]
 *
 * Returns a PNG card for sharing an answer on social media.
 * If the answer has an attached image, it is used as the card background.
 * Otherwise uses a gradient with the politician's photo.
 */

import { ImageResponse } from "next/og";
import { createAdminClient } from "@/lib/supabase/server";

export const runtime = "edge";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;

  const admin = createAdminClient();

  // Fetch answer + politician + question
  const { data: answer } = await admin
    .from("answers")
    .select(`
      id,
      body,
      created_at,
      politician_id,
      politicians ( full_name, office, state, photo_url ),
      question_id
    `)
    .eq("id", id)
    .maybeSingle();

  if (!answer) {
    return new Response("Answer not found", { status: 404 });
  }

  const politician = Array.isArray(answer.politicians)
    ? answer.politicians[0]
    : answer.politicians;

  // Fetch attached image if any
  const { data: mediaItems } = await admin
    .from("answer_media")
    .select("public_url, media_type")
    .eq("answer_id", id)
    .eq("media_type", "image")
    .limit(1);

  const bgImage = mediaItems?.[0]?.public_url ?? null;

  // Fetch question body
  const { data: question } = answer.question_id
    ? await admin
        .from("questions")
        .select("body")
        .eq("id", answer.question_id)
        .maybeSingle()
    : { data: null };

  const politicianName = politician?.full_name ?? "Politician";
  const office = politician?.office ?? "";
  const state = politician?.state ?? "";
  const questionBody = question?.body ?? "";
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
          background: bgImage ? "transparent" : "linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)",
          position: "relative",
          fontFamily: "sans-serif",
        }}
      >
        {bgImage && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={bgImage}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
              filter: "brightness(0.35)",
            }}
          />
        )}

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
    }
  );
}
