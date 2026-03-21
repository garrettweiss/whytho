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

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
