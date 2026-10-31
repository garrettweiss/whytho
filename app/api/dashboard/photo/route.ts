import { NextRequest, NextResponse } from "next/server";
import { revalidatePath, revalidateTag } from "next/cache";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { MAX_PORTRAIT_BYTES, normalizeUploadedPortrait, PORTRAIT_RIGHTS_VERSION } from "@/lib/photos/portrait";
import { z } from "zod";
import { durableRateLimit, rateLimitKey } from "@/lib/security/durable-rate-limit";

export const runtime = "nodejs";
const fields = z.object({ politician_id: z.string().uuid(), rights_confirmed: z.literal("true"), credit: z.string().trim().min(2).max(160) });

async function boundedForm(request: NextRequest): Promise<FormData> {
  const limit = MAX_PORTRAIT_BYTES + 64 * 1024;
  if (Number(request.headers.get("content-length")) > limit || !request.body) throw new Error("Photo upload exceeds 4 MB.");
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > limit) { await reader.cancel(); throw new Error("Photo upload exceeds 4 MB."); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  return new Request(request.url, { method: "POST", headers: { "content-type": request.headers.get("content-type") ?? "" }, body: Buffer.concat(chunks) }).formData();
}

export async function POST(request: NextRequest) {
  const session = await createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({ error: "Sign in with your verified team account." }, { status: 401 });
  let form: FormData;
  try { form = await boundedForm(request); }
  catch { return NextResponse.json({ error: "Choose a JPEG, PNG or WebP photo of 4 MB or less." }, { status: 422 }); }
  const parsed = fields.safeParse(Object.fromEntries(["politician_id", "rights_confirmed", "credit"].map(key => [key, form.get(key)])));
  if (!parsed.success) return NextResponse.json({ error: "Select a profile, name the photographer or copyright holder, and confirm permission." }, { status: 422 });
  const file = form.get("file");
  if (!(file instanceof Blob)) return NextResponse.json({ error: "Choose a photo." }, { status: 422 });
  const admin = createAdminClient();
  const { data: membership, error: membershipError } = await admin.from("politician_team").select("role,politicians(verification_tier)")
    .eq("user_id", user.id).eq("politician_id", parsed.data.politician_id).maybeSingle();
  const politician = membership?.politicians;
  if (membershipError || membership?.role !== "admin" || !politician || !["2", "3"].includes(politician.verification_tier)) {
    return NextResponse.json({ error: "Only a verified profile's team admin can change its photo." }, { status: 403 });
  }
  const limit = await durableRateLimit(rateLimitKey("portrait", user.id), 10, 86400);
  if (limit !== "allowed") return NextResponse.json({ error: limit === "limited" ? "You can change profile photos up to 10 times per day." : "Photo updates are temporarily unavailable." }, { status: limit === "limited" ? 429 : 503 });
  let bytes: Buffer;
  try { bytes = await normalizeUploadedPortrait(Buffer.from(await file.arrayBuffer())); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Photo could not be read." }, { status: 422 }); }
  const path = `${parsed.data.politician_id}/${crypto.randomUUID()}.jpg`;
  const { error: uploadError } = await admin.storage.from("politician-photos").upload(path, bytes, { contentType: "image/jpeg", upsert: false, cacheControl: "31536000" });
  if (uploadError) return NextResponse.json({ error: "Photo storage is unavailable. Please try again." }, { status: 503 });
  const { data: url } = admin.storage.from("politician-photos").getPublicUrl(path);
  // Check authorization again while holding DB locks, then retain an immutable history.
  const { data, error } = await admin.rpc("replace_verified_portrait", {
    p_actor: user.id, p_politician: parsed.data.politician_id, p_url: url.publicUrl,
    p_credit: parsed.data.credit, p_rights_version: PORTRAIT_RIGHTS_VERSION,
  });
  if (error) return NextResponse.json({ error: "The photo was not published. Your team access may have changed. Refresh and try again." }, { status: error.code === "42501" ? 403 : 503 });
  revalidateTag("politician-profile");
  revalidatePath("/dashboard");
  revalidatePath("/", "layout");
  if (data) revalidatePath(`/${data}`);
  return NextResponse.json({ success: true, photo_url: url.publicUrl, credit: parsed.data.credit });
}
