/**
 * DELETE /api/dashboard/disconnect
 *
 * Removes the authenticated user's own team membership for a politician.
 * If no admins remain after removal, resets the politician's verification_tier to "0" (Unclaimed).
 *
 * Body: { politician_id: string }
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export async function DELETE(req: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json() as { politician_id?: string };
  const { politician_id } = body;

  if (!politician_id) {
    return NextResponse.json({ error: "politician_id required" }, { status: 400 });
  }

  // Confirm caller is on this team
  const { data: membership } = await supabase
    .from("politician_team")
    .select("id")
    .eq("politician_id", politician_id)
    .eq("user_id", user.id)
    .single();

  if (!membership) {
    return NextResponse.json({ error: "Not a team member" }, { status: 403 });
  }

  const admin = createAdminClient();

  // Remove the caller's own membership
  const { error: deleteError } = await admin
    .from("politician_team")
    .delete()
    .eq("id", membership.id);

  if (deleteError) {
    return NextResponse.json({ error: deleteError.message }, { status: 500 });
  }

  // If no admins remain, reset politician to Unclaimed (tier "0")
  const { count: adminCount } = await admin
    .from("politician_team")
    .select("*", { count: "exact", head: true })
    .eq("politician_id", politician_id)
    .eq("role", "admin");

  if ((adminCount ?? 0) === 0) {
    await admin
      .from("politicians")
      .update({ verification_tier: "0" })
      .eq("id", politician_id);
  }

  return NextResponse.json({ success: true });
}
