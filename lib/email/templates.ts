import { SITE_URL } from "./resend";

/**
 * Answer notification — sent to the question submitter when their question
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
      <p class="header-sub">Civic accountability — silence is its own answer.</p>
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

  const text = `WhyTho — ${politicianName} answered your question\n\nYour question:\n"${questionPreview}"\n\nTheir response (${typeLabel}):\n${answerPreview}\n\nView the full answer:\n${profileUrl}\n\n---\nYou're receiving this because you submitted a question on WhyTho.\nhttps://whytho.us`;

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
