/**
 * PATCH /api/admin/feedback — update feedback status or publish a reviewed mayor suggestion.
 */

import { NextRequest, NextResponse } from "next/server";
import { isUuid, readAccountBody } from "@/lib/accounts/request";
import { createAdminClient, createClient } from "@/lib/supabase/server";

export async function PATCH(req: NextRequest) {
  const { id, status, secret, government_email_domain } = (await readAccountBody(req)) ?? {};

  if (!process.env.ADMIN_SECRET || secret !== process.env.ADMIN_SECRET) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!isUuid(id)) return NextResponse.json({ error: "A feedback ID is required" }, { status: 400 });

  const admin = createAdminClient();
  if (status === "approve_mayor") {
    if (government_email_domain !== undefined && typeof government_email_domain !== "string") {
      return NextResponse.json({ error: "Enter an official .gov email domain." }, { status: 400 });
    }
    const domain = government_email_domain?.trim().toLowerCase();
    if (domain && (domain.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+gov$/.test(domain))) {
      return NextResponse.json({ error: "Enter an official .gov email domain." }, { status: 400 });
    }
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const { data, error } = await admin.rpc("approve_mayor_suggestion", {
      p_feedback_id: id,
      ...(user && !user.is_anonymous ? { p_reviewer_id: user.id } : {}),
      ...(domain ? { p_government_email_domain: domain } : {}),
    });
    switch (error?.code) {
      case undefined:
        if (!error && data) return NextResponse.json({ ok: true, politician_id: data });
        return NextResponse.json({ error: "The mayor could not be published. Please try again." }, { status: 503 });
      case "P0002": return NextResponse.json({ error: "Mayor suggestion could not be found." }, { status: 404 });
      case "22023": return NextResponse.json({ error: "The suggestion needs a valid officeholder, city, state and official city page." }, { status: 422 });
      case "23505": return NextResponse.json({ error: "A possible matching profile already exists. Resolve it through the reviewed mayor import first." }, { status: 409 });
      case "55000": return NextResponse.json({ error: "This suggestion is already resolved or needs manual review." }, { status: 409 });
      default: return NextResponse.json({ error: "The mayor could not be published. Please try again." }, { status: 503 });
    }
  }

  const validStatuses = ["new", "reviewed", "actioned", "dismissed"];
  if (typeof status !== "string" || !validStatuses.includes(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const changeable = status === "actioned"
    ? "category.is.null,category.neq.mayor_request"
    : "category.is.null,category.neq.mayor_request,status.in.(new,reviewed)";
  const { data, error } = await admin
    .from("chatbot_feedback")
    .update({ status })
    .eq("id", id)
    .or(changeable)
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "Feedback could not be updated." }, { status: 500 });
  }
  if (!data) return NextResponse.json({ error: "Feedback has already been resolved or needs a different action." }, { status: 409 });

  return NextResponse.json({ ok: true });
}
