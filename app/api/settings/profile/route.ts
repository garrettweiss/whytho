/**
 * GET  /api/settings/profile  — Return current user's profile fields
 * PATCH /api/settings/profile  — Update city, county, state_code, political_affiliation
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";

const VALID_AFFILIATIONS = [
  "Democrat",
  "Republican",
  "Independent",
  "Green",
  "Libertarian",
  "Other",
] as const;

export async function GET() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const { data: profile } = await supabase
    .from("user_profiles")
    .select("city, county, state_code, political_affiliation")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    city: profile?.city ?? null,
    county: profile?.county ?? null,
    state_code: profile?.state_code ?? null,
    political_affiliation: profile?.political_affiliation ?? null,
  });
}

export async function PATCH(request: NextRequest) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    city?: string | null;
    county?: string | null;
    state_code?: string | null;
    political_affiliation?: string | null;
  };

  // Validate state_code
  if (
    body.state_code !== undefined &&
    body.state_code !== null &&
    !/^[A-Z]{2}$/.test(body.state_code)
  ) {
    return NextResponse.json(
      { error: "state_code must be a 2-letter uppercase state abbreviation" },
      { status: 400 }
    );
  }

  // Validate political_affiliation
  if (
    body.political_affiliation !== undefined &&
    body.political_affiliation !== null &&
    !VALID_AFFILIATIONS.includes(body.political_affiliation as (typeof VALID_AFFILIATIONS)[number])
  ) {
    return NextResponse.json(
      { error: `political_affiliation must be one of: ${VALID_AFFILIATIONS.join(", ")}` },
      { status: 400 }
    );
  }

  const update: Record<string, string | null> = {};

  if ("city" in body) update.city = body.city ?? null;
  if ("county" in body) update.county = body.county ?? null;
  if ("state_code" in body) update.state_code = body.state_code ?? null;
  if ("political_affiliation" in body)
    update.political_affiliation = body.political_affiliation ?? null;

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: "No valid fields to update" }, { status: 400 });
  }

  const admin = createAdminClient();

  const { error } = await admin
    .from("user_profiles")
    .upsert({ id: user.id, ...update, updated_at: new Date().toISOString() });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
