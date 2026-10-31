import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { teamInviteEmail } from "@/lib/email/templates";
import { accountError, isUuid, readAccountBody } from "@/lib/accounts/request";

export async function GET(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const politicianId = request.nextUrl.searchParams.get("politician_id");
  if (!isUuid(politicianId)) return NextResponse.json({ error: "A valid politician_id is required" }, { status: 400 });
  const { data: membership, error: membershipError } = await supabase.from("politician_team")
    .select("role").eq("politician_id", politicianId).eq("user_id", user.id).maybeSingle();
  if (membershipError) return accountError(membershipError);
  if (!membership) return NextResponse.json({ error: "Not a team member" }, { status: 403 });
  const admin = createAdminClient();
  const { data: members, error, count } = await admin.from("politician_team")
    .select("id,role,created_at,user_id", { count: "exact" }).eq("politician_id", politicianId).order("created_at").order("id").limit(1000);
  if (error) return accountError(error);
  if (!members || count !== members.length) return NextResponse.json({ error: "Could not load the complete team. Please try again." }, { status: 503 });
  const ids = members.map(member => member.user_id);
  const { data: profiles, error: profileError } = ids.length ? await admin.from("user_profiles").select("id,display_name").in("id", ids) : { data: [], error: null };
  if (profileError) return accountError(profileError);
  const names = new Map((profiles ?? []).map(profile => [profile.id, profile.display_name]));
  // Exact ID lookups avoid Auth's first-page limit and never enumerate unrelated users.
  // Staff emails are visible only to admins and the account's owner.
  const enriched = await Promise.all(members.map(async member => {
    let email = "";
    if (membership.role === "admin" || member.user_id === user.id) {
      const { data, error: authError } = await admin.auth.admin.getUserById(member.user_id);
      if (authError) throw new Error("Team account lookup failed");
      email = data.user?.email ?? "";
    }
    return { ...member, email, display_name: names.get(member.user_id) ?? null, is_self: member.user_id === user.id };
  })).catch(() => null);
  if (!enriched) return NextResponse.json({ error: "Could not load team accounts. Please try again." }, { status: 503 });
  return NextResponse.json({ members: enriched, caller_role: membership.role });
}

async function mutateTeam(request: NextRequest, action: "add" | "role" | "remove") {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await readAccountBody(request);
  if (!body || !isUuid(body.politician_id)) return NextResponse.json({ error: "A valid politician_id is required" }, { status: 400 });
  if (action !== "add" && !isUuid(body.team_member_id)) return NextResponse.json({ error: "A valid team_member_id is required" }, { status: 400 });
  if (action !== "remove" && (typeof body.role !== "string" || !["admin", "editor", "responder"].includes(body.role))) return NextResponse.json({ error: "Choose admin, editor, or responder" }, { status: 400 });
  if (action === "add" && (typeof body.email !== "string" || body.email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(body.email.trim()))) return NextResponse.json({ error: "A valid account email is required" }, { status: 400 });
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("manage_politician_team", {
    p_actor_id: user.id, p_politician_id: body.politician_id, p_action: action,
    ...(action !== "add" ? { p_member_id: body.team_member_id as string } : { p_email: (body.email as string).trim().toLowerCase() }),
    ...(action !== "remove" ? { p_role: body.role as string } : {}),
  });
  if (error) return accountError(error);
  if (action === "add") {
    try {
      const result = data as { email: string };
      const [{ data: politician }, { data: profile }] = await Promise.all([
        admin.from("politicians").select("full_name,slug").eq("id", body.politician_id).single(),
        admin.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle(),
      ]);
      if (politician) {
        const message = teamInviteEmail({ politicianName: politician.full_name, politicianSlug: politician.slug, role: body.role as string, inviterName: profile?.display_name ?? user.email ?? "A team admin" });
        await getResend().emails.send({ from: FROM_EMAIL, to: result.email, ...message });
      }
    } catch { /* Membership is saved even when its email notification is unavailable. */ }
  }
  return NextResponse.json(data, { status: action === "add" ? 201 : 200 });
}

export const POST = (request: NextRequest) => mutateTeam(request, "add");
export const PATCH = (request: NextRequest) => mutateTeam(request, "role");
export const DELETE = (request: NextRequest) => mutateTeam(request, "remove");
