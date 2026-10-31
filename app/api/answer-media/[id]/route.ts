import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const PRIVATE_HEADERS = {
  "Cache-Control": "private, no-store, max-age=0",
  "Vary": "Cookie",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

function unavailable(status = 404) {
  return NextResponse.json({ error: "Media unavailable" }, { status, headers: PRIVATE_HEADERS });
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { return await deliverMedia(await params); }
  catch { return unavailable(503); }
}

async function deliverMedia({ id }: { id: string }) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) return unavailable();

  // Both records are read with the caller's session and database RLS. A service
  // client is used only to sign the path after the visibility checks succeed.
  const supabase = await createClient();
  const readSignal = AbortSignal.timeout(8_000);
  const { data: media, error: mediaError } = await supabase.from("answer_media")
    .select("id, answer_id, politician_id, storage_path").eq("id", id).abortSignal(readSignal).maybeSingle();
  if (mediaError) return unavailable(503);
  if (!media) return unavailable();

  const { data: answer, error: answerError } = await supabase.from("answers")
    .select("id, politician_id, is_draft, published_by")
    .eq("id", media.answer_id).eq("politician_id", media.politician_id).abortSignal(readSignal).maybeSingle();
  if (answerError) return unavailable(503);
  if (!answer) return unavailable();

  if (answer.is_draft) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user || user.is_anonymous) return unavailable();
    const { data: membership, error } = await supabase.from("politician_team")
      .select("role").eq("politician_id", answer.politician_id).eq("user_id", user.id).abortSignal(readSignal).maybeSingle();
    if (error) return unavailable(503);
    const canReview = membership && ["admin", "editor"].includes(membership.role);
    const ownsDraft = membership?.role === "responder" && answer.published_by === user.id;
    if (!canReview && !ownsDraft) return unavailable();
  }

  // Refuse unrelated object paths even if a metadata row were malformed.
  const expectedPrefix = `${answer.politician_id}/${answer.id}/`;
  if (!media.storage_path.startsWith(expectedPrefix) || media.storage_path.includes("..") || media.storage_path.includes("\\")) return unavailable();
  const { data, error } = await createAdminClient().storage.from("answer-media").createSignedUrl(media.storage_path, 60);
  if (error || !data?.signedUrl) return unavailable(503);
  return new NextResponse(null, { status: 307, headers: { ...PRIVATE_HEADERS, Location: data.signedUrl } });
}
