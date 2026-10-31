import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { accountError, isUuid, readAccountBody } from "@/lib/accounts/request";

/** Private drafts stay editable. Published responses have a 15-minute window. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  const body = await readAccountBody(request);
  if (!isUuid(id) || !body) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  if (typeof body.body !== "string" || body.body.trim().length < 10 || body.body.trim().length > 5000) return NextResponse.json({ error: "Answer must be 10 to 5000 characters" }, { status: 422 });
  const { data, error } = await createAdminClient().rpc("save_politician_answer", { p_actor_id: user.id, p_action: "edit", p_answer_id: id, p_body: body.body.trim() });
  if (error) return accountError(error);
  revalidateTag("politician-profile");
  revalidatePath("/dashboard");
  return NextResponse.json(data);
}
