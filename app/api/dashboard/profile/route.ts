/**
 * PATCH /api/dashboard/profile
 *
 * Allows politician team admins to update basic profile fields:
 * website_url, bio
 *
 * Body: { politician_id: string, website_url?: string, bio?: string }
 * Auth: Supabase session + admin role on politician_team
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    politician_id?: string;
    website_url?: string;
    bio?: string;
  };

  if (!body.politician_id) {
    return NextResponse.json({ error: "politician_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Must be admin on this team
  const { data: membership } = await admin
    .from("politician_team")
    .select("role")
    .eq("politician_id", body.politician_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (!membership || membership.role !== "admin") {
    return NextResponse.json({ error: "Only team admins can update profile fields" }, { status: 403 });
  }

  const updates: Record<string, string | null> = {};

  if (typeof body.website_url === "string") {
    const url = body.website_url.trim();
    if (url && !url.startsWith("http")) {
      return NextResponse.json({ error: "website_url must start with http:// or https://" }, { status: 422 });
    }
    updates.website_url = url || null;
  }

  if (typeof body.bio === "string") {
    const bio = body.bio.trim();
    if (bio.length > 1000) {
      return NextResponse.json({ error: "bio must be 1000 characters or fewer" }, { status: 422 });
    }
    updates.bio = bio || null;
  }

  if (Object.keys(updates).length === 0) {
    return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  }

  const { error } = await admin
    .from("politicians")
    .update(updates)
    .eq("id", body.politician_id);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
