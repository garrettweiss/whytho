/**
 * POST /api/verify/request-profile
 *
 * Receives a profile creation request from a politician who couldn't find
 * themselves in the verify wizard search. Sends an admin notification email
 * with the submitted details.
 *
 * Body: { name: string, office?: string, state?: string, email: string }
 * Auth: none required (public endpoint)
 */

import { NextRequest, NextResponse } from "next/server";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";

const ADMIN_EMAIL = process.env.ADMIN_EMAIL ?? "garrettweiss@gmail.com";

export async function POST(request: NextRequest) {
  const body = (await request.json()) as {
    name?: string;
    office?: string;
    state?: string;
    email?: string;
  };

  const name = (body.name ?? "").trim();
  const email = (body.email ?? "").trim();
  const office = (body.office ?? "").trim();
  const state = (body.state ?? "").trim();

  if (!name) {
    return NextResponse.json({ error: "name is required" }, { status: 400 });
  }

  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "A valid email is required" }, { status: 400 });
  }

  if (name.length > 200 || office.length > 200 || state.length > 100 || email.length > 200) {
    return NextResponse.json({ error: "Input too long" }, { status: 422 });
  }

  const subject = `[WhyTho] Profile Request: ${name}`;
  const html = `
    <h2>New Profile Request</h2>
    <p>A politician couldn't find their profile in the verify wizard and submitted a request.</p>
    <table style="border-collapse:collapse;width:100%;max-width:480px;">
      <tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5;">Name</td><td style="padding:6px 12px;">${escapeHtml(name)}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5;">Office</td><td style="padding:6px 12px;">${escapeHtml(office) || "<em>not provided</em>"}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5;">State</td><td style="padding:6px 12px;">${escapeHtml(state) || "<em>not provided</em>"}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:600;background:#f5f5f5;">Email</td><td style="padding:6px 12px;">${escapeHtml(email)}</td></tr>
    </table>
    <p style="margin-top:16px;font-size:13px;color:#666;">
      Create their politician profile in the admin panel, then reach out to ${escapeHtml(email)} with the claim link.
    </p>
  `;
  const text = [
    "New Profile Request",
    "",
    `Name:   ${name}`,
    `Office: ${office || "(not provided)"}`,
    `State:  ${state || "(not provided)"}`,
    `Email:  ${email}`,
    "",
    "Create their profile in the admin panel and reach out to them with the claim link.",
  ].join("\n");

  try {
    await getResend().emails.send({
      from: FROM_EMAIL,
      to: ADMIN_EMAIL,
      subject,
      html,
      text,
    });
  } catch {
    return NextResponse.json({ error: "Failed to send notification. Please try again." }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
