/**
 * POST /api/answers
 *
 * Submits an official answer to a qualifying question.
 * Requires the authenticated user to be on the politician's team.
 *
 * Body:
 *   {
 *     question_id: string,
 *     body: string,               // answer text (10-5000 chars)
 *     answer_type?: "direct" | "team_statement",  // default: role-dependent
 *     sources?: string[]          // optional source URLs
 *   }
 *
 * Role logic:
 *   admin/editor → publish only for a verified profile (tier 2 or 3)
 *   responder → private drafts only
 *   unverified profiles → private drafts regardless of team role
 *
 * Returns: { success: true, answer_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { accountError, isUuid, readAccountBody } from "@/lib/accounts/request";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { answerNotificationEmail, draftAnswerNotificationEmail } from "@/lib/email/templates";

const MIN_BODY = 10;
const MAX_BODY = 5000;

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = await readAccountBody(request);
  if (!body) return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });

  if (!isUuid(body.question_id)) {
    return NextResponse.json({ error: "question_id is required" }, { status: 400 });
  }
  if (!body.body || typeof body.body !== "string") {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const answerText = body.body.trim();
  if (answerText.length < MIN_BODY) {
    return NextResponse.json(
      { error: `Answer must be at least ${MIN_BODY} characters` },
      { status: 422 }
    );
  }
  if (answerText.length > MAX_BODY) {
    return NextResponse.json(
      { error: `Answer must be at most ${MAX_BODY} characters` },
      { status: 422 }
    );
  }

  const admin = createAdminClient();

  // Fetch question to get politician_id, week_number, and submitter for notification
  const { data: question, error: qErr } = await admin
    .from("questions")
    .select("id, politician_id, week_number, net_upvotes, status, submitted_by")
    .eq("id", body.question_id)
    .single();

  if (qErr || !question) {
    return NextResponse.json({ error: "Question not found" }, { status: 404 });
  }

  if (question.status !== "active") {
    return NextResponse.json({ error: "Question is no longer active" }, { status: 422 });
  }

  // Check team membership + role
  const { data: membership } = await admin
    .from("politician_team")
    .select("role")
    .eq("politician_id", question.politician_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || !["admin", "editor", "responder"].includes(membership.role)) {
    return NextResponse.json(
      { error: "You are not authorized to answer for this politician" },
      { status: 403 }
    );
  }

  const { data: politician, error: politicianError } = await admin
    .from("politicians")
    .select("verification_tier")
    .eq("id", question.politician_id)
    .single();
  if (politicianError || !politician) {
    return NextResponse.json({ error: "Could not confirm profile verification. Please try again." }, { status: 503 });
  }

  // A self-claimed identity may prepare drafts but cannot speak officially.
  const role = membership.role;
  if (body.answer_type === "direct" && role === "responder") {
    return NextResponse.json(
      { error: "Responders must submit drafts for review" },
      { status: 403 }
    );
  }


  if (body.answer_type !== undefined && !["direct", "team_statement"].includes(String(body.answer_type))) {
    return NextResponse.json({ error: "Invalid response type" }, { status: 422 });
  }
  const sources: string[] = [];
  if (body.sources !== undefined) {
    if (!Array.isArray(body.sources) || body.sources.length > 20) return NextResponse.json({ error: "Provide at most 20 source URLs" }, { status: 422 });
    for (const value of body.sources) {
      try {
        if (typeof value !== "string" || value.length > 2000) throw new Error();
        const url = new URL(value);
        if (url.protocol !== "https:" || url.username || url.password) throw new Error();
        sources.push(url.href);
      } catch { return NextResponse.json({ error: "Sources must be valid HTTPS URLs" }, { status: 422 }); }
    }
  }

  // Idempotency: check if this politician already has a live answer for this question
  const { data: existing } = await admin
    .from("answers")
    .select("id")
    .eq("question_id", question.id)
    .in("answer_type", ["direct", "team_statement"])
    .eq("is_ai_generated", false)
    .eq("is_draft", false)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: "This question already has an official answer" },
      { status: 409 }
    );
  }

  // Reauthorize against the current role and profile while holding database locks.
  const { data: saved, error: insertErr } = await admin.rpc("save_politician_answer", {
    p_actor_id: user.id, p_action: "create", p_question_id: question.id,
    p_body: answerText, p_sources: sources,
    ...(typeof body.answer_type === "string" ? { p_requested_type: body.answer_type } : {}),
  });
  if (insertErr) return accountError(insertErr);
  const answer = saved as { answer_id: string; is_draft: boolean; answer_type: "direct" | "team_statement" };
  const isDraft = answer.is_draft;
  const answerType = answer.answer_type;

  // Fire-and-forget: notify team admins/editors when a responder submits a draft
  if (isDraft) {
    void (async () => {
      try {
        const [{ data: politician }, { data: teamMembers }, { data: submitterData }, { data: q }] = await Promise.all([
          admin.from("politicians").select("full_name, slug").eq("id", question.politician_id).single(),
          admin.from("politician_team").select("user_id, role").eq("politician_id", question.politician_id).in("role", ["admin", "editor"]),
          admin.auth.admin.getUserById(user.id),
          admin.from("questions").select("body").eq("id", question.id).single(),
        ]);
        if (!politician || !q || !teamMembers?.length) return;
        const submitterName = submitterData?.user?.email ?? "A team responder";

        await Promise.all(
          teamMembers.map(async (member) => {
            const { data: memberData } = await admin.auth.admin.getUserById(member.user_id);
            const memberEmail = memberData?.user?.email;
            if (!memberEmail) return;
            const { subject, html, text } = draftAnswerNotificationEmail({
              politicianName: politician.full_name,
              politicianSlug: politician.slug,
              questionBody: q.body,
              draftBody: answerText,
              submitterName,
            });
            await getResend().emails.send({ from: FROM_EMAIL, to: memberEmail, subject, html, text });
          })
        );
      } catch { }
    })();
  }

  // Fire-and-forget: notify the question submitter via email (live answers only)
  void (async () => {
    try {
      if (isDraft) return; // don't notify constituent until answer is approved
      if (!question.submitted_by) return;

      // Fetch question submitter's email + politician name
      const [{ data: submitterData }, { data: politician }] = await Promise.all([
        admin.auth.admin.getUserById(question.submitted_by),
        admin
          .from("politicians")
          .select("full_name, slug")
          .eq("id", question.politician_id)
          .single(),
      ]);

      const email = submitterData?.user?.email;
      if (!email || !politician) return;

      // Respect the submitter's notification preference
      const { data: profile } = await admin
        .from("user_profiles")
        .select("notify_answer")
        .eq("id", question.submitted_by!)
        .maybeSingle();
      if (profile && profile.notify_answer === false) return;

      // Fetch question body
      const { data: q } = await admin
        .from("questions")
        .select("body")
        .eq("id", question.id)
        .single();
      if (!q) return;

      const { subject, html, text } = answerNotificationEmail({
        questionBody: q.body,
        answerBody: answerText,
        answerType,
        politicianName: politician.full_name,
        politicianSlug: politician.slug,
      });

      await getResend().emails.send({
        from: FROM_EMAIL,
        to: email,
        subject,
        html,
        text,
      });
    } catch {
      // Never let email errors affect the API response
    }
  })();

  revalidateTag("politician-profile");
  revalidatePath("/dashboard");
  return NextResponse.json({
    success: true,
    answer_id: answer.answer_id,
    answer_type: answerType,
    is_draft: isDraft,
  });
}
