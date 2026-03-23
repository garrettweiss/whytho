/**
 * /admin/feedback: Chatbot feedback queue
 *
 * Shows user feedback collected by the chatbot assistant.
 * Team can review, action, or dismiss items.
 * Protected by ?secret=ADMIN_SECRET
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { FeedbackActions } from "./feedback-actions";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

interface Props {
  searchParams: Promise<{ secret?: string; status?: string }>;
}

const PRIORITY_COLORS: Record<number, string> = {
  5: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
  4: "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400",
  3: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
  2: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  1: "bg-muted text-muted-foreground",
};

const CATEGORY_LABELS: Record<string, string> = {
  bug: "🐛 Bug",
  feature: "✨ Feature",
  ux: "🎨 UX",
  content: "📝 Content",
  other: "💬 Other",
};

export default async function FeedbackPage({ searchParams }: Props) {
  const { secret, status: statusFilter } = await searchParams;
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) redirect("/");

  const admin = createAdminClient();
  const activeStatus = statusFilter ?? "new";
  const secretParam = `?secret=${secret}`;

  const [{ count: newCount }, { count: reviewedCount }, { count: actionedCount }] =
    await Promise.all([
      admin.from("chatbot_feedback").select("*", { count: "exact", head: true }).eq("status", "new"),
      admin.from("chatbot_feedback").select("*", { count: "exact", head: true }).eq("status", "reviewed"),
      admin.from("chatbot_feedback").select("*", { count: "exact", head: true }).eq("status", "actioned"),
    ]);

  const { data: items } = await admin
    .from("chatbot_feedback")
    .select("id, raw_message, category, priority, recommendation, status, created_at")
    .eq("status", activeStatus)
    .order("priority", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(100);

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">

        {/* Header */}
        <div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
            <Link href={`/admin${secretParam}`} className="hover:text-foreground transition-colors">
              Admin
            </Link>
            <span>/</span>
            <span>Feedback</span>
          </div>
          <h1 className="text-2xl font-bold">Chatbot Feedback</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            User feedback and product suggestions collected by the WhyTho Assistant
          </p>
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 border-b pb-2">
          {[
            { key: "new", label: "New", count: newCount ?? 0, color: "yellow" },
            { key: "reviewed", label: "Reviewed", count: reviewedCount ?? 0, color: "blue" },
            { key: "actioned", label: "Actioned", count: actionedCount ?? 0, color: "green" },
          ].map(({ key, label, count, color }) => {
            const isActive = activeStatus === key;
            const colorActive =
              color === "yellow" ? "border-yellow-500 text-yellow-700 dark:text-yellow-400" :
              color === "blue"   ? "border-blue-500 text-blue-700 dark:text-blue-400" :
                                   "border-green-500 text-green-700 dark:text-green-400";
            return (
              <Link
                key={key}
                href={`/admin/feedback${secretParam}&status=${key}`}
                className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-[2px] ${
                  isActive ? colorActive : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label} {count > 0 && <span className="ml-1 tabular-nums">({count})</span>}
              </Link>
            );
          })}
        </div>

        {/* Feedback items */}
        {!items || items.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <p className="text-2xl mb-2">
              {activeStatus === "new" ? "🎉" : activeStatus === "reviewed" ? "📋" : "✅"}
            </p>
            <p className="font-medium">
              {activeStatus === "new" ? "No new feedback" : `No ${activeStatus} items`}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Feedback is collected automatically when users interact with the chatbot.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((item) => (
              <div key={item.id} className="rounded-xl border bg-card overflow-hidden">
                <div className="px-4 py-3 space-y-2">
                  {/* Meta row */}
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.category && (
                      <span className="text-xs font-medium text-muted-foreground">
                        {CATEGORY_LABELS[item.category] ?? item.category}
                      </span>
                    )}
                    {item.priority && (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${
                          PRIORITY_COLORS[item.priority] ?? PRIORITY_COLORS[1]
                        }`}
                      >
                        P{item.priority}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-auto">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>

                  {/* Raw feedback */}
                  <p className="text-sm">{item.raw_message}</p>

                  {/* Claude recommendation */}
                  {item.recommendation && (
                    <div className="rounded-lg bg-muted/50 px-3 py-2 text-xs text-muted-foreground">
                      <span className="font-medium text-foreground/70">Recommendation: </span>
                      {item.recommendation}
                    </div>
                  )}
                </div>

                {/* Actions */}
                {activeStatus === "new" && (
                  <div className="px-4 py-2 border-t flex items-center gap-2">
                    <FeedbackActions feedbackId={item.id} adminSecret={secret ?? ""} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
