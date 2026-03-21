/**
 * /admin/x-queue: X Post Review Queue
 *
 * Shows x_posts with status='review' (curator score 5–7).
 * Admin can Approve or Reject each post.
 * Approved posts become eligible for jack-publisher to promote to WhyTho questions.
 *
 * Protected by ?secret=ADMIN_SECRET
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { XQueueActions } from "./x-queue-actions";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

interface Props {
  searchParams: Promise<{ secret?: string; status?: string }>;
}

function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return null;
  const color =
    score >= 8 ? "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400" :
    score >= 5 ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400" :
                 "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400";
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold tabular-nums ${color}`}>
      {score}/10
    </span>
  );
}

export default async function XQueuePage({ searchParams }: Props) {
  const { secret, status: statusFilter } = await searchParams;
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) redirect("/");

  const admin = createAdminClient();
  const activeStatus = statusFilter ?? "review";

  // Counts for tab pills
  const [{ count: reviewCount }, { count: approvedCount }, { count: rejectedCount }] =
    await Promise.all([
      admin.from("x_posts").select("*", { count: "exact", head: true }).eq("status", "review"),
      admin.from("x_posts").select("*", { count: "exact", head: true }).eq("status", "approved").is("whytho_question_id", null),
      admin.from("x_posts").select("*", { count: "exact", head: true }).eq("status", "rejected"),
    ]);

  // Posts for active tab
  const { data: posts } = await admin
    .from("x_posts")
    .select(`
      id, tweet_id, body, author_handle, author_name,
      likes, retweets, reply_count, tweet_date, tweet_url,
      curator_score, curator_notes, rejection_reason, theme_tags,
      status, politician_id,
      politicians!politician_id (full_name, office, state, slug)
    `)
    .eq("status", activeStatus)
    .order("curator_score", { ascending: false })
    .limit(100);

  const secretParam = `?secret=${secret}`;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
              <Link href={`/admin${secretParam}`} className="hover:text-foreground transition-colors">
                Admin
              </Link>
              <span>/</span>
              <span>X Queue</span>
            </div>
            <h1 className="text-2xl font-bold">🐦 X Question Queue</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Real constituent questions harvested from X, scored by Claude
            </p>
          </div>
        </div>

        {/* Status tabs */}
        <div className="flex gap-2 border-b pb-2">
          {[
            { key: "review", label: "Needs Review", count: reviewCount ?? 0, color: "yellow" },
            { key: "approved", label: "Approved (unpublished)", count: approvedCount ?? 0, color: "green" },
            { key: "rejected", label: "Rejected", count: rejectedCount ?? 0, color: "red" },
          ].map(({ key, label, count, color }) => {
            const isActive = activeStatus === key;
            const colorActive =
              color === "yellow" ? "border-yellow-500 text-yellow-700 dark:text-yellow-400" :
              color === "green"  ? "border-green-500 text-green-700 dark:text-green-400" :
                                   "border-red-500 text-red-700 dark:text-red-400";
            return (
              <Link
                key={key}
                href={`/admin/x-queue${secretParam}&status=${key}`}
                className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-[2px] ${
                  isActive
                    ? colorActive
                    : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label} {count > 0 && <span className="ml-1 tabular-nums">({count})</span>}
              </Link>
            );
          })}
        </div>

        {/* Posts */}
        {!posts || posts.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <p className="text-2xl mb-2">
              {activeStatus === "review" ? "🎉" : activeStatus === "approved" ? "✅" : "🗑️"}
            </p>
            <p className="font-medium">
              {activeStatus === "review" ? "Queue is clear" :
               activeStatus === "approved" ? "No approved posts pending publish" :
               "No rejected posts"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {activeStatus === "review" && "Run jack-harvester + jack-curator to collect more tweets."}
              {activeStatus === "approved" && "Run jack-publisher.ts to promote approved posts to WhyTho questions."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {(posts as typeof posts).map((post) => {
              const politician = Array.isArray(post.politicians)
                ? post.politicians[0]
                : post.politicians;

              const tags = (post.theme_tags ?? []) as string[];

              return (
                <div
                  key={post.id}
                  className="rounded-xl border bg-card shadow-sm overflow-hidden"
                >
                  {/* Tweet body */}
                  <div className="px-4 pt-4 pb-3 space-y-3">
                    {/* Author + score row */}
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-2 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center shrink-0 text-sm font-bold">
                          {post.author_handle.charAt(0).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="text-sm font-semibold truncate">
                            {post.author_name ?? `@${post.author_handle}`}
                          </p>
                          <a
                            href={post.tweet_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                          >
                            @{post.author_handle} ↗
                          </a>
                        </div>
                      </div>
                      <ScoreBadge score={post.curator_score} />
                    </div>

                    {/* Tweet text */}
                    <p className="text-sm leading-relaxed">{post.body}</p>

                    {/* Engagement + date */}
                    <div className="flex gap-4 text-xs text-muted-foreground">
                      <span>❤️ {post.likes ?? 0}</span>
                      <span>🔁 {post.retweets ?? 0}</span>
                      <span>💬 {post.reply_count ?? 0}</span>
                      {post.tweet_date && (
                        <span>{new Date(post.tweet_date).toLocaleDateString()}</span>
                      )}
                    </div>
                  </div>

                  {/* Curator notes + tags */}
                  {(post.curator_notes || tags.length > 0) && (
                    <div className="px-4 py-2.5 bg-muted/40 border-t space-y-1.5">
                      {post.curator_notes && (
                        <p className="text-xs text-muted-foreground">
                          <span className="font-medium text-foreground/70">🤖 Curator: </span>
                          {post.curator_notes}
                        </p>
                      )}
                      {post.rejection_reason && (
                        <p className="text-xs text-destructive">
                          Reason: {post.rejection_reason.replace(/_/g, " ")}
                        </p>
                      )}
                      {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {tags.map((tag) => (
                            <span
                              key={tag}
                              className="px-1.5 py-0.5 rounded bg-muted text-xs text-muted-foreground border"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* Politician + actions footer */}
                  <div className="px-4 py-2.5 border-t flex items-center justify-between gap-4">
                    <div className="text-xs text-muted-foreground">
                      {politician ? (
                        <Link
                          href={`/${politician.slug}`}
                          target="_blank"
                          className="hover:text-foreground transition-colors font-medium"
                        >
                          {politician.full_name}
                          {politician.state ? ` · ${politician.state}` : ""}
                        </Link>
                      ) : (
                        <span>Unknown politician</span>
                      )}
                    </div>

                    {activeStatus === "review" && (
                      <XQueueActions postId={post.id} adminSecret={secret ?? ""} />
                    )}
                    {activeStatus === "approved" && (
                      <span className="text-xs text-green-600 dark:text-green-400 font-medium">
                        ✅ Approved: run jack-publisher.ts to promote
                      </span>
                    )}
                    {activeStatus === "rejected" && (
                      <XQueueActions postId={post.id} adminSecret={secret ?? ""} showRestore />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Footer instructions */}
        <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-medium text-foreground/80">Pipeline commands</p>
          <p><code className="font-mono">npx tsx scripts/jack-harvester.ts</code> — collect tweets from X</p>
          <p><code className="font-mono">npx tsx scripts/jack-curator.ts</code> — score pending tweets with Claude</p>
          <p><code className="font-mono">npx tsx scripts/jack-publisher.ts</code> — promote approved posts to WhyTho questions</p>
        </div>

      </div>
    </div>
  );
}
