/**
 * POST /api/answers/[id]/media
 *
 * Upload a photo, video, or audio file attached to an answer.
 * Accepts multipart/form-data with a "file" field.
 * Auth: team member on the politician that owns this answer.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const MAX_SIZES: Record<string, number> = {
  image: 10 * 1024 * 1024,   // 10 MB
  video: 200 * 1024 * 1024,  // 200 MB
  audio: 25 * 1024 * 1024,   // 25 MB
};

const MIME_TO_TYPE: Record<string, "image" | "video" | "audio"> = {
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/heic": "image",
  "image/gif": "image",
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
  "audio/mpeg": "audio",
  "audio/wav": "audio",
  "audio/mp4": "audio",
  "audio/ogg": "audio",
  "audio/x-m4a": "audio",
};

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
    .select("id, politician_id")
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

  if (!membership) {
    return NextResponse.json({ error: "Not authorized" }, { status: 403 });
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
  const mediaType = MIME_TO_TYPE[mimeType];
  if (!mediaType) {
    return NextResponse.json(
      { error: `Unsupported file type: ${mimeType}` },
      { status: 422 }
    );
  }

  const maxSize = MAX_SIZES[mediaType]!;
  if (file.size > maxSize) {
    const maxMB = maxSize / (1024 * 1024);
    return NextResponse.json(
      { error: `File too large. Maximum size for ${mediaType} is ${maxMB}MB` },
      { status: 422 }
    );
  }

  const fileName = file instanceof File ? file.name : `upload.${mimeType.split("/")[1]}`;
  const ext = fileName.split(".").pop() ?? mimeType.split("/")[1] ?? "bin";
  const uniqueName = `${crypto.randomUUID()}.${ext}`;
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

  // Get public URL
  const { data: urlData } = admin.storage
    .from("answer-media")
    .getPublicUrl(storagePath);

  const publicUrl = urlData.publicUrl;

  // Insert answer_media record
  const { data: mediaRecord, error: dbError } = await admin
    .from("answer_media")
    .insert({
      answer_id: answerId,
      politician_id: answer.politician_id,
      media_type: mediaType,
      storage_path: storagePath,
      public_url: publicUrl,
      file_name: fileName,
      file_size_bytes: file.size,
      mime_type: mimeType,
    })
    .select()
    .single();

  if (dbError) {
    // Clean up storage on DB failure
    await admin.storage.from("answer-media").remove([storagePath]);
    return NextResponse.json({ error: dbError.message }, { status: 500 });
  }

  return NextResponse.json({ media: mediaRecord }, { status: 201 });
}
