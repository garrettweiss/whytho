/**
 * /api/dashboard/team
 *
 * GET  → list team members for a politician
 * POST → add a member by email + role
 * DELETE → remove a member by team entry id
 *
 * Requires: authenticated user with admin role on the politician_team.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { teamInviteEmail } from "@/lib/email/templates";

// ── GET /api/dashboard/team?politician_id=xxx ─────────────────────────────────

export async function GET(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const politicianId = req.nextUrl.searchParams.get("politician_id");
  if (!politicianId) {
    return NextResponse.json({ error: "politician_id required" }, { status: 400 });
  }

  // Verify caller is on this team
  const { data: membership } = await supabase
    .from("politician_team")
    .select("role")
    .eq("politician_id", politicianId)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a team member" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Fetch team members
  const { data: members, error } = await admin
    .from("politician_team")
    .select("id, role, created_at, user_id")
    .eq("politician_id", politicianId)
    .order("created_at", { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Enrich with emails from auth.users
  const userIds = (members ?? []).map((m) => m.user_id);
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers();
  const emailMap = new Map<string, string>();
  for (const u of authUsers ?? []) {
    if (userIds.includes(u.id)) emailMap.set(u.id, u.email ?? "");
  }

  // Enrich with display names from user_profiles
  const { data: profiles } = await admin
    .from("user_profiles")
    .select("id, display_name")
    .in("id", userIds);

  const profileMap = new Map<string, string | null>();
  for (const p of profiles ?? []) profileMap.set(p.id, p.display_name);

  const enriched = (members ?? []).map((m) => ({
    id: m.id,
    user_id: m.user_id,
    role: m.role,
    created_at: m.created_at,
    email: emailMap.get(m.user_id) ?? "",
    display_name: profileMap.get(m.user_id) ?? null,
    is_self: m.user_id === user.id,
  }));

  return NextResponse.json({ members: enriched, caller_role: membership.role });
}

// ── POST /api/dashboard/team ──────────────────────────────────────────────────

export async function POST(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { politician_id?: string; email?: string; role?: string };
  const { politician_id, email, role } = body;

  if (!politician_id || !email || !role) {
    return NextResponse.json({ error: "politician_id, email, and role required" }, { status: 400 });
  }

  const validRoles = ["admin", "editor", "responder"];
  if (!validRoles.includes(role)) {
    return NextResponse.json({ error: `role must be one of: ${validRoles.join(", ")}` }, { status: 400 });
  }

  // Caller must be admin on this politician
  const { data: callerMembership } = await supabase
    .from("politician_team")
    .select("role")
    .eq("politician_id", politician_id)
    .eq("user_id", user.id)
    .single();

  if (!callerMembership || callerMembership.role !== "admin") {
    return NextResponse.json({ error: "Only team admins can add members" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Look up invitee by email
  const { data: { users: authUsers } } = await admin.auth.admin.listUsers();
  const invitee = authUsers?.find((u) => u.email?.toLowerCase() === email.toLowerCase());

  if (!invitee) {
    return NextResponse.json({
      error: `No WhyTho account found for ${email}. Ask them to sign up at whytho.us first.`,
    }, { status: 404 });
  }

  // Check not already on team
  const { data: existing } = await admin
    .from("politician_team")
    .select("id")
    .eq("politician_id", politician_id)
    .eq("user_id", invitee.id)
    .single();

  if (existing) {
    return NextResponse.json({ error: "That person is already on the team" }, { status: 409 });
  }

  // Add to team
  const { data: newMember, error: insertError } = await admin
    .from("politician_team")
    .insert({
      politician_id,
      user_id: invitee.id,
      role: role as "admin" | "editor" | "responder",
      invited_by: user.id,
    })
    .select()
    .single();

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  // Fire-and-forget: notify the new team member
  void (async () => {
    try {
      const inviteeEmail = invitee.email;
      if (!inviteeEmail) return;
      const [{ data: pol }, { data: inviterProfile }] = await Promise.all([
        admin.from("politicians").select("full_name, slug").eq("id", politician_id).single(),
        admin.from("user_profiles").select("display_name").eq("id", user.id).maybeSingle(),
      ]);
      if (!pol) return;
      const inviterName = inviterProfile?.display_name ?? user.email ?? "A team admin";
      const { subject, html, text } = teamInviteEmail({
        politicianName: pol.full_name,
        politicianSlug: pol.slug,
        role,
        inviterName,
      });
      await getResend().emails.send({ from: FROM_EMAIL, to: inviteeEmail, subject, html, text });
    } catch {
      // Never let email errors affect the API response
    }
  })();

  return NextResponse.json({ member: newMember, email: invitee.email }, { status: 201 });
}

// ── DELETE /api/dashboard/team ────────────────────────────────────────────────

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { team_member_id?: string; politician_id?: string };
  const { team_member_id, politician_id } = body;

  if (!team_member_id || !politician_id) {
    return NextResponse.json({ error: "team_member_id and politician_id required" }, { status: 400 });
  }

  // Caller must be admin on this politician
  const { data: callerMembership } = await supabase
    .from("politician_team")
    .select("role")
    .eq("politician_id", politician_id)
    .eq("user_id", user.id)
    .single();

  if (!callerMembership || callerMembership.role !== "admin") {
    return NextResponse.json({ error: "Only team admins can remove members" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Prevent removing yourself if you're the only admin
  const { data: targetMember } = await admin
    .from("politician_team")
    .select("user_id, role")
    .eq("id", team_member_id)
    .single();

  if (targetMember?.user_id === user.id) {
    // Check if there are other admins
    const { count } = await admin
      .from("politician_team")
      .select("*", { count: "exact", head: true })
      .eq("politician_id", politician_id)
      .eq("role", "admin");

    if ((count ?? 0) <= 1) {
      return NextResponse.json({ error: "Cannot remove yourself: you are the only admin" }, { status: 400 });
    }
  }

  const { error } = await admin
    .from("politician_team")
    .delete()
    .eq("id", team_member_id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ success: true });
}
