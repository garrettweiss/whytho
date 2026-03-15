/**
 * POST /api/verify/meta-tag
 *
 * Method E — Website meta tag verification.
 * User places a <meta name="whytho-verification" content="[code]"> on their
 * official website. We crawl it server-side and confirm ownership.
 *
 * Actions:
 *   { action: "generate", politician_id } — returns a unique verification code
 *     to embed in their site's <head>
 *   { action: "check",    politician_id } — fetches politician.website_url and
 *     checks for the meta tag with the correct code
 *
 * Auth: Supabase session + politician_team membership
 *
 * On check success: DB trigger trg_verification_tier auto-upgrades politician
 * to tier 2 if 2+ distinct methods are now completed.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import crypto from "crypto";

const CRAWL_TIMEOUT_MS = 10_000;

function generateVerificationCode(): string {
  return `wt-${crypto.randomBytes(16).toString("hex")}`;
}

async function getTeamMembership(
  admin: ReturnType<typeof createAdminClient>,
  politicianId: string,
  userId: string
): Promise<boolean> {
  const { data } = await admin
    .from("politician_team")
    .select("id")
    .eq("politician_id", politicianId)
    .eq("user_id", userId)
    .maybeSingle();
  return !!data;
}

/** Fetches a URL and returns the whytho-verification meta tag content, or null. */
async function fetchMetaTagCode(url: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      headers: {
        "User-Agent": "WhyThoBot/1.0 (+https://whytho.us/verify)",
        Accept: "text/html",
      },
      signal: AbortSignal.timeout(CRAWL_TIMEOUT_MS),
      redirect: "follow",
    });

    if (!res.ok) return null;

    // Only read first 50KB — meta tags are always in <head>
    const reader = res.body?.getReader();
    if (!reader) return null;

    let html = "";
    while (html.length < 50_000) {
      const { done, value } = await reader.read();
      if (done) break;
      html += new TextDecoder().decode(value);
      // Stop once we've passed </head>
      if (html.toLowerCase().includes("</head>")) break;
    }
    reader.cancel();

    // Match both attribute orderings
    const nameFirst =
      /<meta\s+name=["']whytho-verification["']\s+content=["']([^"']+)["']/i.exec(html);
    const contentFirst =
      /<meta\s+content=["']([^"']+)["']\s+name=["']whytho-verification["']/i.exec(html);

    return nameFirst?.[1] ?? contentFirst?.[1] ?? null;
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user || user.is_anonymous) {
    return NextResponse.json({ error: "Authentication required" }, { status: 401 });
  }

  const body = (await request.json()) as {
    action?: string;
    politician_id?: string;
  };

  if (!body.politician_id) {
    return NextResponse.json({ error: "politician_id is required" }, { status: 400 });
  }

  const admin = createAdminClient();

  const onTeam = await getTeamMembership(admin, body.politician_id, user.id);
  if (!onTeam) {
    return NextResponse.json(
      { error: "You are not authorized for this profile" },
      { status: 403 }
    );
  }

  // ── GENERATE ─────────────────────────────────────────────────────────────────
  if (body.action === "generate") {
    // Check for existing verification record
    const { data: existing } = await admin
      .from("politician_verifications")
      .select("id, verification_code, status")
      .eq("politician_id", body.politician_id)
      .eq("user_id", user.id)
      .eq("method", "meta_tag")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (existing?.status === "completed") {
      return NextResponse.json({ success: true, already_verified: true });
    }

    // Reuse existing pending code so the user doesn't need to change the tag
    if (existing?.verification_code) {
      const code = existing.verification_code;
      return NextResponse.json({
        success: true,
        code,
        instruction: buildInstruction(code),
      });
    }

    // Generate and store a new code
    const code = generateVerificationCode();
    const { error: insertErr } = await admin.from("politician_verifications").insert({
      politician_id: body.politician_id,
      user_id: user.id,
      method: "meta_tag",
      status: "pending",
      verification_code: code,
      metadata: {},
    });

    if (insertErr) {
      return NextResponse.json({ error: insertErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      code,
      instruction: buildInstruction(code),
    });
  }

  // ── CHECK ─────────────────────────────────────────────────────────────────────
  if (body.action === "check") {
    const { data: verification } = await admin
      .from("politician_verifications")
      .select("id, verification_code, status")
      .eq("politician_id", body.politician_id)
      .eq("user_id", user.id)
      .eq("method", "meta_tag")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!verification) {
      return NextResponse.json(
        { error: "Generate a verification code first." },
        { status: 404 }
      );
    }

    if (verification.status === "completed") {
      return NextResponse.json({ success: true, already_verified: true });
    }

    // Fetch politician website URL
    const { data: politician } = await admin
      .from("politicians")
      .select("website_url")
      .eq("id", body.politician_id)
      .single();

    if (!politician?.website_url) {
      return NextResponse.json(
        {
          error:
            "No website URL found for this politician. Please add it to your profile before verifying.",
        },
        { status: 422 }
      );
    }

    const foundCode = await fetchMetaTagCode(politician.website_url);

    if (!foundCode) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          message:
            "Verification tag not found. Ensure the meta tag is in your <head> and the site is publicly accessible.",
          website_url: politician.website_url,
        },
        { status: 422 }
      );
    }

    if (foundCode !== verification.verification_code) {
      return NextResponse.json(
        {
          success: false,
          verified: false,
          message:
            "Meta tag found but the code does not match. Copy the exact code from the generate step.",
          website_url: politician.website_url,
        },
        { status: 422 }
      );
    }

    // Mark completed — DB trigger trg_verification_tier handles tier upgrade
    const { error: updateErr } = await admin
      .from("politician_verifications")
      .update({
        status: "completed",
        verified_at: new Date().toISOString(),
        metadata: { website_url: politician.website_url },
      })
      .eq("id", verification.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      verified: true,
      method: "meta_tag",
      message: "Website ownership verified successfully.",
    });
  }

  return NextResponse.json(
    { error: "Invalid action. Use 'generate' or 'check'." },
    { status: 400 }
  );
}

function buildInstruction(code: string): string {
  return `Add this tag to your website's <head>:\n\n<meta name="whytho-verification" content="${code}">\n\nOnce published, click "Check Verification" to confirm.`;
}
