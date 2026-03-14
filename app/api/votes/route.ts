import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

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
