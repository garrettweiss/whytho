import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { qualifyingQuestionAlertEmail } from "@/lib/email/templates";

interface VoteBody {
  question_id: string;
  week_number: number;
  value: 1 | -1 | null; // null = remove vote
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as VoteBody;
    const { question_id, week_number, value } = body;

    if (!question_id || !week_number) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (value === null) {
      // Remove vote
      const { error } = await supabase
        .from("votes")
        .delete()
        .eq("question_id", question_id)
        .eq("user_id", user.id)
        .eq("week_number", week_number);

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ success: true });
    }

    if (value !== 1 && value !== -1) {
      return NextResponse.json({ error: "Invalid vote value" }, { status: 400 });
    }

    // Rate limit: 30 votes per user per 10 minutes (new votes only — not toggles)
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const { count: recentVoteCount } = await supabase
      .from("votes")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.id)
      .gte("created_at", tenMinutesAgo);

    if ((recentVoteCount ?? 0) >= 30) {
      return NextResponse.json(
        { error: "Too many votes. Please slow down and try again in a few minutes." },
        { status: 429 }
      );
    }

    // Upsert vote — UNIQUE(user_id, question_id, week_number)
    const { error } = await supabase.from("votes").upsert(
      {
        question_id,
        user_id: user.id,
        week_number,
        value,
      },
      { onConflict: "user_id,question_id,week_number" }
    );

    if (error) {
      // 409 = duplicate key (optimistic UI handles this)
      const status = error.code === "23505" ? 409 : 500;
      return NextResponse.json({ error: error.message }, { status });
    }

    // Fire-and-forget: notify politician team if this vote just crossed the qualifying threshold
    void (async () => {
      try {
        if (value !== 1) return; // Only upvotes can cross the threshold
        const admin = createAdminClient();
        const { data: q } = await admin
          .from("questions")
          .select("id, body, net_upvotes, politician_id")
          .eq("id", question_id)
          .single();
        // Exactly 10 means this vote just crossed the threshold
        if (!q || q.net_upvotes !== 10) return;

        const [{ data: pol }, { data: teamMembers }] = await Promise.all([
          admin.from("politicians").select("full_name, slug").eq("id", q.politician_id).single(),
          admin.from("politician_team").select("user_id").eq("politician_id", q.politician_id),
        ]);
        if (!pol || !teamMembers?.length) return;

        // Fetch team member emails
        const emailPromises = teamMembers.map(async (m) => {
          const { data } = await admin.auth.admin.getUserById(m.user_id);
          return data?.user?.email ?? null;
        });
        const emails = (await Promise.all(emailPromises)).filter(Boolean) as string[];
        if (!emails.length) return;

        const { subject, html, text } = qualifyingQuestionAlertEmail({
          politicianName: pol.full_name,
          politicianSlug: pol.slug,
          questionBody: q.body,
          netUpvotes: q.net_upvotes,
        });
        await Promise.all(
          emails.map((to) =>
            getResend().emails.send({ from: FROM_EMAIL, to, subject, html, text })
          )
        );
      } catch {
        // Never let notification errors affect the vote response
      }
    })();

    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

// GET: return the current user's vote on a specific question
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const question_id = searchParams.get("question_id");
  const week_number = searchParams.get("week_number");

  if (!question_id || !week_number) {
    return NextResponse.json({ error: "Missing query params" }, { status: 400 });
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ vote: null });
  }

  const { data } = await supabase
    .from("votes")
    .select("value")
    .eq("question_id", question_id)
    .eq("user_id", user.id)
    .eq("week_number", parseInt(week_number))
    .single();

  return NextResponse.json({ vote: data?.value ?? null });
}
