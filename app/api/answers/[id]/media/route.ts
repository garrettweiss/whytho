/**
 * POST /api/answers/[id]/media
 *
 * Upload a photo, video, or audio file attached to an answer.
 * Accepts multipart/form-data with a "file" field.
 * Auth: publishing team role, or a responder attaching to their own draft.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { MAX_MEDIA_BYTES, MEDIA_TYPES } from "@/components/answers/media-limits";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: answerId } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const admin = createAdminClient();

  // Look up the answer and its politician
  const { data: answer } = await admin
    .from("answers")
    .select("id, politician_id, is_draft, is_ai_generated, answer_type, published_by")
    .eq("id", answerId)
    .maybeSingle();

  if (!answer) {
    return NextResponse.json({ error: "Answer not found" }, { status: 404 });
  }

  // Verify team membership
  const { data: membership } = await admin
    .from("politician_team")
    .select("role")
    .eq("politician_id", answer.politician_id)
    .eq("user_id", user.id)
    .maybeSingle();

  const canPublish = membership && ["admin", "editor"].includes(membership.role);
  const ownsDraft = membership?.role === "responder" && answer.is_draft && answer.published_by === user.id;
  if (!canPublish && !ownsDraft) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
  }

  if (answer.is_ai_generated || !["direct", "team_statement"].includes(answer.answer_type)) {
    return NextResponse.json({ error: "Media can be attached only to an official response." }, { status: 422 });
  }

  // Parse the uploaded file
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid form data" }, { status: 400 });
  }

  const file = formData.get("file");
  if (!file || !(file instanceof Blob)) {
    return NextResponse.json({ error: "No file provided" }, { status: 400 });
  }

  const mimeType = file.type;
  const mediaType = MEDIA_TYPES[mimeType];
  if (!mediaType) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType}` },
      { status: 422 }
    );
  }

  if (file.size > MAX_MEDIA_BYTES) {
    return NextResponse.json(
      { error: "Files must be 4 MB or smaller. Use a link for larger media." },
      { status: 422 }
    );
  }

  const fileName = file instanceof File ? file.name : `upload.${mimeType.split("/")[1]}`;
  // Object names are independent of untrusted original filenames.
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "video/quicktime" ? "mov" : mimeType === "audio/mpeg" ? "mp3" : mimeType === "audio/x-m4a" ? "m4a" : mimeType.split("/")[1];
  const uniqueName = `${crypto.randomUUID()}.${extension}`;
  const storagePath = `${answer.politician_id}/${answerId}/${uniqueName}`;

  // Upload to Supabase Storage
  const arrayBuffer = await file.arrayBuffer();
  const { error: uploadError } = await admin.storage
    .from("answer-media")
    .upload(storagePath, arrayBuffer, {
      contentType: mimeType,
      upsert: false,
    });

  if (uploadError) {
    return NextResponse.json({ error: uploadError.message }, { status: 500 });
  }

  // Keep private objects behind a stable route that rechecks answer visibility.
  // Signed storage URLs are short lived and are never saved in the database.
  const mediaId = crypto.randomUUID();
  const publicUrl = `/api/answer-media/${mediaId}`;

  // The RPC locks the answer while rechecking membership and draft ownership.
  // An approval during the upload cannot authorize a responder's late attachment.
  const { data: attachedId, error: dbError } = await admin.rpc("attach_answer_media", {
    p_actor_id: user.id,
    p_answer_id: answerId,
    p_media_id: mediaId,
    p_storage_path: storagePath,
    p_media_type: mediaType,
    p_public_url: publicUrl,
    p_file_name: fileName,
    p_file_size_bytes: file.size,
    p_mime_type: mimeType,
  });

  if (dbError || attachedId !== mediaId) {
    // Clean up storage on DB failure
    await admin.storage.from("answer-media").remove([storagePath]);
    const changedAccess = dbError?.code === "42501";
    return NextResponse.json({ error: changedAccess ? "Your access or the response status changed. Refresh before attaching media." : "The attachment could not be saved. Please try again." }, { status: changedAccess ? 409 : 500 });
  }

  return NextResponse.json({ media: { id: mediaId, answer_id: answerId, politician_id: answer.politician_id, media_type: mediaType, storage_path: storagePath, public_url: publicUrl, file_name: fileName, file_size_bytes: file.size, mime_type: mimeType } }, { status: 201 });
}
