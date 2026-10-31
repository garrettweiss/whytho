import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { accountError, isUuid } from "@/lib/accounts/request";

/** Current verified admins/editors may publish a draft, once per question. */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  if (!isUuid(id)) return NextResponse.json({ error: "Invalid answer ID" }, { status: 400 });
  const { data, error } = await createAdminClient().rpc("save_politician_answer", { p_actor_id: user.id, p_action: "approve", p_answer_id: id });
  if (error) return accountError(error);
  revalidateTag("politician-profile");
  revalidatePath("/dashboard");
  return NextResponse.json(data);
}
