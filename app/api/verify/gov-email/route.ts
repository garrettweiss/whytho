/**
 * POST /api/verify/gov-email
 *
 * Method A — Government email verification.
 * User proves they have access to a .gov email associated with their office.
 *
 * Actions:
 *   { action: "request", politician_id, email } — sends 6-digit OTP to .gov address
 *   { action: "confirm", politician_id, code }  — validates OTP, marks method completed
 *
 * Auth: Supabase session + politician_team membership
 *
 * On confirm success: DB trigger trg_verification_tier auto-upgrades politician
 * to tier 2 if 2+ distinct methods are now completed.
 *
 * NOTE: Requires a verified Resend sending domain configured in RESEND_FROM_EMAIL
 * env var (default: noreply@whytho.us). Set up DNS records in Resend dashboard.
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { Resend } from "resend";
import crypto from "crypto";

const resend = new Resend(process.env.RESEND_API_KEY);
const FROM_EMAIL = process.env.RESEND_FROM_EMAIL ?? "noreply@whytho.us";
const CODE_TTL_MINUTES = 30;

function generateOtp(): string {
  // 6-digit numeric OTP
  return crypto.randomInt(100_000, 999_999).toString();
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
    email?: string;
    code?: string;
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

  // ── REQUEST ─────────────────────────────────────────────────────────────────
  if (body.action === "request") {
    if (!body.email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    const email = body.email.toLowerCase().trim();
    if (!email.endsWith(".gov")) {
      return NextResponse.json(
        { error: "Must be a .gov email address" },
        { status: 422 }
      );
    }

    const code = generateOtp();
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000).toISOString();

    // Find existing pending record to update, or create new
    const { data: existingVerification } = await admin
      .from("politician_verifications")
      .select("id")
      .eq("politician_id", body.politician_id)
      .eq("user_id", user.id)
      .eq("method", "gov_email")
      .in("status", ["pending", "expired"])
      .maybeSingle();

    if (existingVerification) {
      const { error: updateErr } = await admin
        .from("politician_verifications")
        .update({
          status: "pending",
          verification_code: code,
          code_expires_at: expiresAt,
          metadata: { email },
        })
        .eq("id", existingVerification.id);

      if (updateErr) {
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    } else {
      const { error: insertErr } = await admin.from("politician_verifications").insert({
        politician_id: body.politician_id,
        user_id: user.id,
        method: "gov_email",
        status: "pending",
        verification_code: code,
        code_expires_at: expiresAt,
        metadata: { email },
      });

      if (insertErr) {
        return NextResponse.json({ error: insertErr.message }, { status: 500 });
      }
    }

    // Send verification email via Resend
    const { error: emailErr } = await resend.emails.send({
      from: `WhyTho Verification <${FROM_EMAIL}>`,
      to: email,
      subject: "Your WhyTho verification code",
      html: `
        <div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
          <h2 style="margin-bottom: 8px;">WhyTho Verification</h2>
          <p>Your verification code is:</p>
          <div style="
            font-size: 2rem;
            font-weight: bold;
            letter-spacing: 0.3em;
            background: #f4f4f5;
            padding: 16px 24px;
            border-radius: 8px;
            display: inline-block;
            margin: 12px 0;
          ">${code}</div>
          <p style="color: #71717a; font-size: 0.875rem;">
            This code expires in ${CODE_TTL_MINUTES} minutes. Do not share it.
          </p>
          <p style="color: #71717a; font-size: 0.875rem;">
            If you did not request this code, you can safely ignore this email.
          </p>
        </div>
      `,
    });

    if (emailErr) {
      return NextResponse.json(
        { error: "Failed to send verification email. Check that the email address is valid." },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `Verification code sent to ${email}. Expires in ${CODE_TTL_MINUTES} minutes.`,
    });
  }

  // ── CONFIRM ──────────────────────────────────────────────────────────────────
  if (body.action === "confirm") {
    if (!body.code) {
      return NextResponse.json({ error: "code is required" }, { status: 400 });
    }

    const { data: verification } = await admin
      .from("politician_verifications")
      .select("id, verification_code, code_expires_at, status")
      .eq("politician_id", body.politician_id)
      .eq("user_id", user.id)
      .eq("method", "gov_email")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!verification) {
      return NextResponse.json(
        { error: "No pending verification found. Please request a new code." },
        { status: 404 }
      );
    }

    if (verification.status === "completed") {
      return NextResponse.json({ success: true, already_verified: true });
    }

    if (
      !verification.code_expires_at ||
      new Date(verification.code_expires_at) < new Date()
    ) {
      await admin
        .from("politician_verifications")
        .update({ status: "expired" })
        .eq("id", verification.id);
      return NextResponse.json(
        { error: "Verification code expired. Please request a new one." },
        { status: 422 }
      );
    }

    if (verification.verification_code !== body.code.trim()) {
      return NextResponse.json({ error: "Incorrect verification code" }, { status: 422 });
    }

    // Mark completed — DB trigger trg_verification_tier handles tier upgrade
    const { error: updateErr } = await admin
      .from("politician_verifications")
      .update({
        status: "completed",
        verified_at: new Date().toISOString(),
        verification_code: null,
        code_expires_at: null,
      })
      .eq("id", verification.id);

    if (updateErr) {
      return NextResponse.json({ error: updateErr.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      method: "gov_email",
      message: "Government email verified successfully.",
    });
  }

  return NextResponse.json(
    { error: "Invalid action. Use 'request' or 'confirm'." },
    { status: 400 }
  );
}
