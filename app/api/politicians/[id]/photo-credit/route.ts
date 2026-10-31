import { NextResponse } from "next/server";
import { createPublicClient } from "@/lib/supabase/server";
import { z } from "zod";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!z.string().uuid().safeParse(id).success) return NextResponse.json({ error: "Invalid profile" }, { status: 400 });
  const { data, error } = await createPublicClient().from("politicians").select("photo_credit,photo_rights_basis,photo_source_url").eq("id", id).maybeSingle();
  // Metadata is optional until the rights migration is applied; do not invent credits.
  if (error || !data) return NextResponse.json({ credit: null }, { headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({ credit: data.photo_credit, basis: data.photo_rights_basis }, { headers: { "Cache-Control": "public, max-age=300" } });
}
