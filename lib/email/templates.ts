import { SITE_URL } from "./resend";

/**
 * Answer notification - sent to the question submitter when their question
 * receives an official answer from a politician's team.
 */
export function answerNotificationEmail({
  questionBody,
  answerBody,
  answerType,
  politicianName,
  politicianSlug,
}: {
  questionBody: string;
  answerBody: string;
  answerType: "direct" | "team_statement";
  politicianName: string;
  politicianSlug: string;
}): { subject: string; html: string; text: string } {
  const profileUrl = `${SITE_URL}/${politicianSlug}`;
  const typeLabel =
    answerType === "direct"
      ? `${politicianName} directly answered`
      : `${politicianName}'s team responded`;

  const questionPreview =
    questionBody.length > 200
      ? questionBody.slice(0, 197) + "…"
      : questionBody;

  const answerPreview =
    answerBody.length > 400
      ? answerBody.slice(0, 397) + "…"
      : answerBody;

  const subject = `${politicianName} answered your question on WhyTho`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f9fafb; color: #111827; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #111827; color: #ffffff; padding: 24px 28px; }
    .header-title { font-size: 20px; font-weight: 700; margin: 0; letter-spacing: -0.3px; }
    .header-sub { font-size: 13px; color: #9ca3af; margin-top: 4px; }
    .body { padding: 24px 28px; }
    .label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin-bottom: 6px; }
    .question-block { background: #f3f4f6; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; }
    .question-text { font-size: 15px; line-height: 1.5; margin: 0; color: #374151; }
    .answer-block { border-left: 3px solid #111827; padding-left: 14px; margin-bottom: 20px; }
    .answer-type { font-size: 12px; color: #6b7280; margin-bottom: 6px; }
    .answer-text { font-size: 15px; line-height: 1.55; margin: 0; color: #111827; }
    .cta-btn { display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 8px; }
    .footer { padding: 16px 28px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; line-height: 1.5; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="header-title">WhyTho</p>
      <p class="header-sub">Civic accountability: silence is its own answer.</p>
    </div>
    <div class="body">
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151;">
        Your question received an official response.
      </p>

      <div class="label">Your question</div>
      <div class="question-block">
        <p class="question-text">${escapeHtml(questionPreview)}</p>
      </div>

      <div class="label">Official response</div>
      <div class="answer-block">
        <p class="answer-type">${escapeHtml(typeLabel)}</p>
        <p class="answer-text">${escapeHtml(answerPreview)}</p>
      </div>

      <a href="${profileUrl}" class="cta-btn">View full answer →</a>
    </div>
    <div class="footer">
      <p>You're receiving this because you submitted a question on WhyTho.<br />
      <a href="${SITE_URL}">whytho.us</a> · Built by Quinnivations LLC</p>
    </div>
  </div>
</body>
</html>`;

  const text = `WhyTho: ${politicianName} answered your question\n\nYour question:\n"${questionPreview}"\n\nTheir response (${typeLabel}):\n${answerPreview}\n\nView the full answer:\n${profileUrl}\n\n---\nYou're receiving this because you submitted a question on WhyTho.\nhttps://whytho.us`;

  return { subject, html, text };
}

/**
 * Weekly digest - sent every Monday after the weekly reset.
 * Recaps the previous week's top questions, answer highlights, and platform stats.
 */
export function weeklyDigestEmail({
  year,
  week,
  totalQuestions,
  totalAnswers,
  topPoliticians,
  topQuestions,
}: {
  year: number;
  week: number;
  totalQuestions: number;
  totalAnswers: number;
  topPoliticians: Array<{
    name: string;
    slug: string;
    participationRate: number | null;
    answeredQualifying: number;
    qualifyingQuestions: number;
  }>;
  topQuestions: Array<{
    body: string;
    netUpvotes: number;
    politicianName: string;
    politicianSlug: string;
  }>;
}): { subject: string; html: string; text: string } {
  const subject = `Week ${week} recap | WhyTho`;
  const leaderboardUrl = `${SITE_URL}/leaderboard`;
  const settingsUrl = `${SITE_URL}/settings/notifications`;

  const rateLabel = (rate: number | null) =>
    rate !== null ? `${Math.round(rate)}%` : "0%";

  const topPoliticianRows = topPoliticians
    .map(
      (p, i) =>
        `<tr>
          <td style="padding:8px 12px;font-size:13px;">${i + 1}. <a href="${SITE_URL}/${escapeHtml(p.slug)}" style="color:#111827;text-decoration:none;">${escapeHtml(p.name)}</a></td>
          <td style="padding:8px 12px;font-size:13px;text-align:right;font-weight:600;color:${(p.participationRate ?? 0) >= 75 ? "#16a34a" : (p.participationRate ?? 0) >= 40 ? "#d97706" : "#dc2626"};">${rateLabel(p.participationRate)}</td>
          <td style="padding:8px 12px;font-size:12px;color:#6b7280;text-align:right;">${p.answeredQualifying}/${p.qualifyingQuestions}</td>
        </tr>`
    )
    .join("");

  const topQuestionBlocks = topQuestions
    .map(
      (q) =>
        `<div style="margin-bottom:12px;padding:12px;background:#f9fafb;border-radius:8px;">
          <p style="margin:0 0 4px;font-size:14px;color:#111827;">${escapeHtml(q.body.length > 160 ? q.body.slice(0, 157) + "…" : q.body)}</p>
          <p style="margin:0;font-size:12px;color:#6b7280;">→ ${escapeHtml(q.politicianName)} · ▲ ${q.netUpvotes} votes</p>
        </div>`
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f9fafb; color: #111827; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #111827; color: #ffffff; padding: 24px 28px; }
    .header-title { font-size: 20px; font-weight: 700; margin: 0; }
    .header-sub { font-size: 13px; color: #9ca3af; margin: 4px 0 0; }
    .body { padding: 24px 28px; }
    .section-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; margin: 20px 0 8px; }
    .stat-row { display: flex; gap: 16px; margin-bottom: 20px; }
    .stat-box { flex: 1; background: #f3f4f6; border-radius: 8px; padding: 12px 14px; text-align: center; }
    .stat-num { font-size: 24px; font-weight: 700; margin: 0; }
    .stat-label { font-size: 11px; color: #6b7280; margin: 2px 0 0; }
    table { width: 100%; border-collapse: collapse; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; margin-bottom: 16px; }
    th { background: #f3f4f6; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: #6b7280; padding: 8px 12px; text-align: left; }
    tr:nth-child(even) { background: #f9fafb; }
    .cta-btn { display: inline-block; background: #111827; color: #ffffff !important; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; }
    .footer { padding: 16px 28px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="header-title">WhyTho</p>
      <p class="header-sub">Week ${week}, ${year} recap: civic accountability, every Monday.</p>
    </div>
    <div class="body">
      <div class="stat-row">
        <div class="stat-box">
          <p class="stat-num">${totalQuestions.toLocaleString()}</p>
          <p class="stat-label">Questions asked</p>
        </div>
        <div class="stat-box">
          <p class="stat-num">${totalAnswers.toLocaleString()}</p>
          <p class="stat-label">Official answers</p>
        </div>
      </div>

      ${
        topPoliticians.length > 0
          ? `<p class="section-title">Most responsive this week</p>
        <table>
          <thead><tr>
            <th>Politician</th>
            <th style="text-align:right;">Response rate</th>
            <th style="text-align:right;">Answered</th>
          </tr></thead>
          <tbody>${topPoliticianRows}</tbody>
        </table>`
          : ""
      }

      ${
        topQuestions.length > 0
          ? `<p class="section-title">Top questions this week</p>
        ${topQuestionBlocks}`
          : ""
      }

      <a href="${leaderboardUrl}" class="cta-btn">See the full leaderboard →</a>
    </div>
    <div class="footer">
      <p>You're receiving this weekly digest from WhyTho.<br />
      <a href="${settingsUrl}">Unsubscribe or change preferences</a> · <a href="${SITE_URL}">whytho.us</a></p>
    </div>
  </div>
</body>
</html>`;

  const textLines = [
    `WhyTho: Week ${week}, ${year} Recap`,
    "",
    `${totalQuestions} questions asked · ${totalAnswers} official answers`,
    "",
  ];
  if (topPoliticians.length > 0) {
    textLines.push("Most responsive this week:");
    topPoliticians.forEach((p, i) => {
      textLines.push(
        `  ${i + 1}. ${p.name}: ${rateLabel(p.participationRate)} (${p.answeredQualifying}/${p.qualifyingQuestions} answered)`
      );
    });
    textLines.push("");
  }
  if (topQuestions.length > 0) {
    textLines.push("Top questions:");
    topQuestions.forEach((q) => {
      textLines.push(
        `  • "${q.body.length > 100 ? q.body.slice(0, 97) + "…" : q.body}" (→ ${q.politicianName}, ▲${q.netUpvotes})`
      );
    });
    textLines.push("");
  }
  textLines.push(`Full leaderboard: ${leaderboardUrl}`);
  textLines.push(`Manage notifications: ${settingsUrl}`);

  return { subject, html, text: textLines.join("\n") };
}

/**
 * Claim welcome — sent to politician team admin immediately after a successful claim (tier 0 to 1).
 */
export function claimWelcomeEmail({
  politicianName,
  politicianSlug,
}: {
  politicianName: string;
  politicianSlug: string;
}): { subject: string; html: string; text: string } {
  const verifyUrl = `${SITE_URL}/verify`;
  const profileUrl = `${SITE_URL}/${politicianSlug}`;
  const subject = `You've claimed ${politicianName}'s WhyTho profile`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f9fafb; color: #111827; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #111827; color: #ffffff; padding: 24px 28px; }
    .header-title { font-size: 20px; font-weight: 700; margin: 0; }
    .header-sub { font-size: 13px; color: #9ca3af; margin: 4px 0 0; }
    .body { padding: 24px 28px; }
    .step { display: flex; gap: 12px; margin-bottom: 16px; align-items: flex-start; }
    .step-num { flex-shrink: 0; width: 24px; height: 24px; background: #111827; color: #fff; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 700; }
    .cta-btn { display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 8px; }
    .footer { padding: 16px 28px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="header-title">WhyTho</p>
      <p class="header-sub">Profile claimed successfully.</p>
    </div>
    <div class="body">
      <p style="margin: 0 0 20px; font-size: 15px; color: #374151;">
        You've claimed <strong>${escapeHtml(politicianName)}'s</strong> profile on WhyTho. Your next step is verifying your identity.
      </p>
      <p style="font-size: 13px; font-weight: 600; color: #374151; margin: 0 0 12px; text-transform: uppercase; letter-spacing: 0.05em;">What happens next</p>
      <div class="step">
        <div class="step-num">1</div>
        <p style="margin: 0; font-size: 14px; color: #374151;">Complete 2 verification methods to reach <strong>Verified status</strong>. You can use a .gov email address or website meta tag.</p>
      </div>
      <div class="step">
        <div class="step-num">2</div>
        <p style="margin: 0; font-size: 14px; color: #374151;">Once verified, your profile shows a <strong>Verified checkmark</strong> visible to all constituents.</p>
      </div>
      <div class="step">
        <div class="step-num">3</div>
        <p style="margin: 0; font-size: 14px; color: #374151;">Start responding to qualifying questions from your <strong>Dashboard</strong>. Qualifying questions have 10+ votes.</p>
      </div>
      <a href="${verifyUrl}" class="cta-btn">Complete verification →</a>
      <p style="margin: 20px 0 0; font-size: 13px; color: #6b7280;">
        You can also <a href="${profileUrl}" style="color: #374151;">view your public profile</a> to see what constituents see.
      </p>
    </div>
    <div class="footer">
      <p>You're receiving this because you claimed a profile on WhyTho.<br />
      <a href="${SITE_URL}">whytho.us</a> · Built by Quinnivations LLC</p>
    </div>
  </div>
</body>
</html>`;

  const text = `WhyTho: You've claimed ${politicianName}'s profile\n\nYour next step is verification.\n\nComplete verification: ${verifyUrl}\nView public profile: ${profileUrl}\n\n---\nYou're receiving this because you claimed a profile on WhyTho.\nhttps://whytho.us`;

  return { subject, html, text };
}

/**
 * Verification confirmed — sent when a politician reaches Verified status (tier 2).
 */
export function verificationConfirmedEmail({
  politicianName,
  politicianSlug,
}: {
  politicianName: string;
  politicianSlug: string;
}): { subject: string; html: string; text: string } {
  const dashboardUrl = `${SITE_URL}/dashboard`;
  const profileUrl = `${SITE_URL}/${politicianSlug}`;
  const subject = `${politicianName} is now Verified on WhyTho`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f9fafb; color: #111827; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #111827; color: #ffffff; padding: 24px 28px; }
    .header-title { font-size: 20px; font-weight: 700; margin: 0; }
    .badge { display: inline-block; background: #16a34a; color: #fff; border-radius: 6px; padding: 4px 10px; font-size: 13px; font-weight: 600; margin-top: 8px; }
    .body { padding: 24px 28px; }
    .cta-btn { display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 8px; }
    .secondary-btn { display: inline-block; border: 1px solid #e5e7eb; color: #374151; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 500; margin-top: 8px; margin-left: 8px; }
    .footer { padding: 16px 28px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="header-title">WhyTho</p>
      <span class="badge">Verified ✓</span>
    </div>
    <div class="body">
      <p style="margin: 0 0 16px; font-size: 15px; color: #374151;">
        <strong>${escapeHtml(politicianName)}</strong> is now fully verified on WhyTho. Constituents can see your Verified checkmark on your public profile.
      </p>
      <p style="margin: 0 0 20px; font-size: 14px; color: #6b7280;">
        Qualifying questions (10+ votes) are waiting in your dashboard. Every week resets on Monday. Your response rate is always public.
      </p>
      <a href="${dashboardUrl}" class="cta-btn">Go to Dashboard →</a>
      <a href="${profileUrl}" class="secondary-btn">View public profile</a>
    </div>
    <div class="footer">
      <p>You're receiving this because you verified a profile on WhyTho.<br />
      <a href="${SITE_URL}">whytho.us</a> · Built by Quinnivations LLC</p>
    </div>
  </div>
</body>
</html>`;

  const text = `WhyTho: ${politicianName} is now Verified\n\nYour profile now shows a Verified checkmark to all constituents.\n\nGo to Dashboard: ${dashboardUrl}\nView public profile: ${profileUrl}\n\n---\nhttps://whytho.us`;

  return { subject, html, text };
}

/**
 * Qualifying question alert — sent to all politician team members when a question
 * first crosses the 10-vote qualifying threshold.
 */
export function qualifyingQuestionAlertEmail({
  politicianName,
  politicianSlug,
  questionBody,
  netUpvotes,
}: {
  politicianName: string;
  politicianSlug: string;
  questionBody: string;
  netUpvotes: number;
}): { subject: string; html: string; text: string } {
  const dashboardUrl = `${SITE_URL}/dashboard`;
  const subject = `New qualifying question for ${politicianName} on WhyTho`;
  const preview = questionBody.length > 200 ? questionBody.slice(0, 197) + "…" : questionBody;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f9fafb; color: #111827; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #111827; color: #ffffff; padding: 24px 28px; }
    .header-title { font-size: 20px; font-weight: 700; margin: 0; }
    .header-sub { font-size: 13px; color: #9ca3af; margin: 4px 0 0; }
    .body { padding: 24px 28px; }
    .question-block { background: #fefce8; border: 1px solid #fde68a; border-radius: 8px; padding: 14px 16px; margin-bottom: 20px; }
    .vote-badge { display: inline-block; background: #d97706; color: #fff; border-radius: 4px; padding: 2px 8px; font-size: 12px; font-weight: 600; margin-bottom: 8px; }
    .cta-btn { display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; }
    .footer { padding: 16px 28px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="header-title">WhyTho</p>
      <p class="header-sub">A question just reached qualifying status.</p>
    </div>
    <div class="body">
      <p style="margin: 0 0 16px; font-size: 15px; color: #374151;">
        A constituent question for <strong>${escapeHtml(politicianName)}</strong> has hit ${netUpvotes} votes and is now qualifying.
      </p>
      <div class="question-block">
        <span class="vote-badge">⚡ ${netUpvotes} votes</span>
        <p style="margin: 0; font-size: 15px; color: #374151; line-height: 1.5;">${escapeHtml(preview)}</p>
      </div>
      <p style="margin: 0 0 16px; font-size: 14px; color: #6b7280;">
        Qualifying questions count toward your response rate. Unanswered qualifying questions are always visible to the public.
      </p>
      <a href="${dashboardUrl}" class="cta-btn">Respond in Dashboard →</a>
    </div>
    <div class="footer">
      <p>You're receiving this because you manage a WhyTho profile.<br />
      <a href="${SITE_URL}/${escapeHtml(politicianSlug)}">View public profile</a> · <a href="${SITE_URL}">whytho.us</a></p>
    </div>
  </div>
</body>
</html>`;

  const text = `WhyTho: New qualifying question for ${politicianName}\n\n"${preview}"\n\n${netUpvotes} votes — qualifying for your response rate.\n\nRespond in Dashboard: ${dashboardUrl}\n\n---\nhttps://whytho.us`;

  return { subject, html, text };
}

/**
 * Weekly politician inbox summary — sent every Monday after the weekly reset.
 * Tells the politician's team how many qualifying questions they have this week.
 */
export function politicianWeeklyInboxEmail({
  politicianName,
  politicianSlug,
  weekNumber,
  qualifyingCount,
  unansweredCount,
}: {
  politicianName: string;
  politicianSlug: string;
  weekNumber: number;
  qualifyingCount: number;
  unansweredCount: number;
}): { subject: string; html: string; text: string } {
  const week = weekNumber % 100;
  const year = Math.floor(weekNumber / 100);
  const dashboardUrl = `${SITE_URL}/dashboard`;
  const profileUrl = `${SITE_URL}/${politicianSlug}`;
  const subject = unansweredCount > 0
    ? `${politicianName}: ${unansweredCount} question${unansweredCount !== 1 ? "s" : ""} awaiting your response`
    : `${politicianName}: Week ${week} inbox — all caught up`;

  const statusColor = unansweredCount > 0 ? "#d97706" : "#16a34a";
  const statusText = unansweredCount > 0
    ? `${unansweredCount} awaiting response`
    : "All answered";

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f9fafb; color: #111827; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #111827; color: #ffffff; padding: 24px 28px; }
    .header-title { font-size: 20px; font-weight: 700; margin: 0; }
    .header-sub { font-size: 13px; color: #9ca3af; margin: 4px 0 0; }
    .body { padding: 24px 28px; }
    .stat-row { display: flex; gap: 16px; margin-bottom: 24px; }
    .stat-box { flex: 1; background: #f3f4f6; border-radius: 8px; padding: 14px; text-align: center; }
    .stat-num { font-size: 28px; font-weight: 700; margin: 0; }
    .stat-label { font-size: 11px; color: #6b7280; margin: 2px 0 0; }
    .cta-btn { display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; }
    .footer { padding: 16px 28px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="header-title">WhyTho</p>
      <p class="header-sub">Week ${week}, ${year} inbox for ${escapeHtml(politicianName)}.</p>
    </div>
    <div class="body">
      <div class="stat-row">
        <div class="stat-box">
          <p class="stat-num">${qualifyingCount}</p>
          <p class="stat-label">Qualifying questions</p>
        </div>
        <div class="stat-box">
          <p class="stat-num" style="color: ${statusColor};">${unansweredCount > 0 ? unansweredCount : "✓"}</p>
          <p class="stat-label">${statusText}</p>
        </div>
      </div>
      ${unansweredCount > 0
        ? `<p style="margin: 0 0 20px; font-size: 14px; color: #374151;">Your constituents are watching. Unanswered qualifying questions count against your response rate, which is always public.</p>`
        : `<p style="margin: 0 0 20px; font-size: 14px; color: #374151;">All qualifying questions answered this week. Your response rate reflects that. New questions may appear as votes accumulate.</p>`
      }
      <a href="${dashboardUrl}" class="cta-btn">${unansweredCount > 0 ? "Respond in Dashboard →" : "View Dashboard →"}</a>
    </div>
    <div class="footer">
      <p>You're receiving this because you manage a WhyTho profile.<br />
      <a href="${profileUrl}">View public profile</a> · <a href="${SITE_URL}">whytho.us</a></p>
    </div>
  </div>
</body>
</html>`;

  const text = `WhyTho: Week ${week}, ${year} inbox for ${politicianName}\n\n${qualifyingCount} qualifying question${qualifyingCount !== 1 ? "s" : ""} this week\n${statusText}\n\nGo to Dashboard: ${dashboardUrl}\nView public profile: ${profileUrl}\n\n---\nhttps://whytho.us`;

  return { subject, html, text };
}

/**
 * Team invite — sent when a new member is added to a politician's team.
 */
export function teamInviteEmail({
  politicianName,
  politicianSlug,
  role,
  inviterName,
}: {
  politicianName: string;
  politicianSlug: string;
  role: string;
  inviterName: string;
}): { subject: string; html: string; text: string } {
  const dashboardUrl = `${SITE_URL}/dashboard`;
  const roleLabel = role.charAt(0).toUpperCase() + role.slice(1);
  const subject = `You've been added to ${politicianName}'s WhyTho team`;

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${subject}</title>
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f9fafb; color: #111827; }
    .container { max-width: 560px; margin: 32px auto; background: #ffffff; border-radius: 12px; border: 1px solid #e5e7eb; overflow: hidden; }
    .header { background: #111827; color: #ffffff; padding: 24px 28px; }
    .header-title { font-size: 20px; font-weight: 700; margin: 0; }
    .body { padding: 24px 28px; }
    .role-badge { display: inline-block; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 6px; padding: 4px 10px; font-size: 13px; font-weight: 600; color: #374151; }
    .cta-btn { display: inline-block; background: #111827; color: #ffffff; text-decoration: none; padding: 12px 24px; border-radius: 8px; font-size: 14px; font-weight: 600; margin-top: 8px; }
    .footer { padding: 16px 28px; border-top: 1px solid #f3f4f6; font-size: 12px; color: #9ca3af; }
    .footer a { color: #6b7280; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <p class="header-title">WhyTho</p>
    </div>
    <div class="body">
      <p style="margin: 0 0 16px; font-size: 15px; color: #374151;">
        <strong>${escapeHtml(inviterName)}</strong> has added you to <strong>${escapeHtml(politicianName)}'s</strong> WhyTho team.
      </p>
      <p style="margin: 0 0 8px; font-size: 13px; color: #6b7280; text-transform: uppercase; font-weight: 600; letter-spacing: 0.05em;">Your role</p>
      <span class="role-badge">${escapeHtml(roleLabel)}</span>
      <p style="margin: 16px 0 20px; font-size: 14px; color: #6b7280;">
        Sign in to WhyTho to access the team dashboard and manage qualifying questions.
      </p>
      <a href="${dashboardUrl}" class="cta-btn">Go to Dashboard →</a>
    </div>
    <div class="footer">
      <p>You're receiving this because you were added to a WhyTho politician team.<br />
      <a href="${SITE_URL}/${escapeHtml(politicianSlug)}">View public profile</a> · <a href="${SITE_URL}">whytho.us</a></p>
    </div>
  </div>
</body>
</html>`;

  const text = `WhyTho: You've been added to ${politicianName}'s team\n\nRole: ${roleLabel}\nAdded by: ${inviterName}\n\nGo to Dashboard: ${dashboardUrl}\n\n---\nhttps://whytho.us`;

  return { subject, html, text };
}

/**
 * Draft answer notification - sent to team admins/editors when a responder
 * submits a draft answer for review.
 */
export function draftAnswerNotificationEmail({
  politicianName,
  politicianSlug,
  questionBody,
  draftBody,
  submitterName,
}: {
  politicianName: string;
  politicianSlug: string;
  questionBody: string;
  draftBody: string;
  submitterName: string;
}): { subject: string; html: string; text: string } {
  const dashboardUrl = `${SITE_URL}/dashboard`;
  const subject = `[WhyTho] Draft response awaiting approval for ${politicianName}`;

  const questionPreview = questionBody.length > 200 ? questionBody.slice(0, 197) + "…" : questionBody;
  const draftPreview = draftBody.length > 400 ? draftBody.slice(0, 397) + "…" : draftBody;

  const html = `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><style>
body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; margin: 0; padding: 0; background: #f9fafb; color: #111827; }
.container { max-width: 520px; margin: 40px auto; background: #fff; border: 1px solid #e5e7eb; border-radius: 12px; overflow: hidden; }
.header { background: #111827; padding: 24px; text-align: center; }
.header h1 { color: #fff; margin: 0; font-size: 20px; font-weight: 700; letter-spacing: -0.3px; }
.body { padding: 28px 32px; }
.label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.07em; color: #6b7280; margin: 0 0 6px; }
.question-box { background: #f3f4f6; border-radius: 8px; padding: 12px 16px; margin-bottom: 16px; font-size: 14px; color: #374151; }
.draft-box { background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px; font-size: 14px; color: #374151; }
.cta-btn { display: inline-block; background: #111827; color: #fff !important; text-decoration: none; padding: 10px 20px; border-radius: 8px; font-size: 14px; font-weight: 600; }
.footer { padding: 16px 32px; background: #f9fafb; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
.footer a { color: #6b7280; }
</style></head>
<body>
  <div class="container">
    <div class="header"><h1>WhyTho</h1></div>
    <div class="body">
      <p style="margin: 0 0 20px; font-size: 15px;">
        <strong>${escapeHtml(submitterName)}</strong> submitted a draft response for <strong>${escapeHtml(politicianName)}</strong> that needs your review.
      </p>
      <p class="label">Question</p>
      <div class="question-box">${escapeHtml(questionPreview)}</div>
      <p class="label">Draft Response</p>
      <div class="draft-box">${escapeHtml(draftPreview)}</div>
      <a href="${dashboardUrl}" class="cta-btn">Review in Dashboard →</a>
    </div>
    <div class="footer">
      <p>You're receiving this as a team admin or editor for ${escapeHtml(politicianName)}.<br />
      <a href="${SITE_URL}/${escapeHtml(politicianSlug)}">View public profile</a> · <a href="${SITE_URL}">whytho.us</a></p>
    </div>
  </div>
</body>
</html>`;

  const text = [
    `Draft response awaiting approval for ${politicianName}`,
    "",
    `Submitted by: ${submitterName}`,
    "",
    `Question: ${questionPreview}`,
    "",
    `Draft: ${draftPreview}`,
    "",
    `Review in dashboard: ${dashboardUrl}`,
  ].join("\n");

  return { subject, html, text };
}

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
