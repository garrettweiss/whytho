import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { profileInput } from "@/lib/photos/profile-input";
import type { Json } from "@/types/database";

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const parsed = profileInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid profile fields" }, { status: 422 });
  const { politician_id, ...fields } = parsed.data;
  if (!Object.keys(fields).length) return NextResponse.json({ error: "No fields to update" }, { status: 400 });
  const admin = createAdminClient();
  // The RPC locks the profile and membership, preventing removal/verification races.
  const { data, error } = await admin.rpc("update_verified_profile", {
    p_actor: user.id, p_politician: politician_id, p_fields: fields as Json,
  });
  if (error) return NextResponse.json({ error: "Only a verified profile's team admin can save these changes." }, { status: error.code === "42501" ? 403 : 503 });
  revalidateTag("politician-profile");
  revalidatePath("/dashboard");
  if (data) revalidatePath(`/${data}`);
  return NextResponse.json({ success: true });
}
