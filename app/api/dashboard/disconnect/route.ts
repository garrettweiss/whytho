import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { accountError, isUuid, readAccountBody } from "@/lib/accounts/request";

/** Leaves a team, preserving at least one administrator and the verified identity. */
export async function DELETE(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await readAccountBody(request);
  if (!body || !isUuid(body.politician_id)) return NextResponse.json({ error: "A valid politician_id is required" }, { status: 400 });
  const { data, error } = await createAdminClient().rpc("manage_politician_team", {
    p_actor_id: user.id, p_politician_id: body.politician_id, p_action: "disconnect",
  });
  if (error) return accountError(error);
  return NextResponse.json(data);
}
