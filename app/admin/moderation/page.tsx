/**
 * /admin/moderation
 *
 * Admin-only moderation queue. Shows auto-hidden questions (status = 'removed')
 * that were flagged by users. Admins can Restore or Permanently Remove each question.
 *
 * Protected by x-admin-secret header check. In production, add proper admin auth.
 */

import { redirect } from "next/navigation";
import { createAdminClient } from "@/lib/supabase/server";
import { ModerationActions } from "./moderation-actions";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

type FlaggedQuestion = {
  id: string;
  body: string;
  report_count: number;
  created_at: string;
  week_number: number;
  politician: {
    id: string;
    full_name: string;
    slug: string;
  } | null;
  top_reason: string;
};

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{ secret?: string }>;
}) {
  const { secret } = await searchParams;

  // Simple secret-based admin auth
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    redirect("/");
  }

  const admin = createAdminClient();

  // Fetch removed questions with report counts and most common reason
  const { data: flagged } = await admin
    .from("questions")
    .select(`
      id,
      body,
      created_at,
      week_number,
      politicians (
        id,
        full_name,
        slug
      )
    `)
    .eq("status", "removed")
    .eq("is_seeded", false)
    .order("created_at", { ascending: false })
    .limit(100);

  // For each question, get report count + top reason
  const enriched: FlaggedQuestion[] = await Promise.all(
    (flagged ?? []).map(async (q) => {
      const { data: reports } = await admin
        .from("question_reports")
        .select("reason")
        .eq("question_id", q.id);

      const count = reports?.length ?? 0;
      const reasonCounts: Record<string, number> = {};
      for (const r of reports ?? []) {
        reasonCounts[r.reason] = (reasonCounts[r.reason] ?? 0) + 1;
      }
      const topReason =
        Object.entries(reasonCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "unknown";

      const politician = Array.isArray(q.politicians) ? q.politicians[0] : q.politicians;

      return {
        id: q.id,
        body: q.body,
        report_count: count,
        created_at: q.created_at,
        week_number: q.week_number,
        politician: politician ?? null,
        top_reason: topReason,
      };
    })
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-8">
          <h1 className="text-2xl font-bold">Moderation Queue</h1>
          <p className="text-muted-foreground mt-1">
            {enriched.length} flagged question{enriched.length !== 1 ? "s" : ""} pending review
          </p>
        </div>

        {enriched.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <p className="text-2xl mb-2">✓</p>
            <p className="font-medium">Queue is clear</p>
            <p className="text-sm text-muted-foreground mt-1">No flagged questions.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {enriched.map((q) => (
              <div key={q.id} className="rounded-xl border bg-card p-4 shadow-sm">
                <div className="flex items-start gap-4">
                  <div className="flex-1 min-w-0 space-y-2">
                    {/* Question body */}
                    <p className="font-medium leading-snug">{q.body}</p>

                    {/* Meta */}
                    <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                      {q.politician && (
                        <a
                          href={`/${q.politician.slug}?secret=${secret}`}
                          className="hover:text-foreground underline-offset-2 hover:underline"
                        >
                          {q.politician.full_name}
                        </a>
                      )}
                      <span>Week {q.week_number}</span>
                      <span>{new Date(q.created_at).toLocaleDateString()}</span>
                      <span className="font-medium text-destructive">
                        {q.report_count} report{q.report_count !== 1 ? "s" : ""}
                      </span>
                      <span className="capitalize">
                        Top reason: {q.top_reason.replace("_", " ")}
                      </span>
                    </div>
                  </div>

                  {/* Actions */}
                  <ModerationActions questionId={q.id} adminSecret={secret ?? ""} />
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
