/**
 * /admin/forwarded: Questions forwarded by chatbot to WhyTho team
 *
 * Team can answer these questions. Published answers are automatically
 * added to the chatbot knowledge base for future use.
 * Protected by ?secret=ADMIN_SECRET
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { ForwardedAnswerForm } from "./forwarded-answer-form";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

interface Props {
  searchParams: Promise<{ secret?: string; filter?: string }>;
}

export default async function ForwardedPage({ searchParams }: Props) {
  const { secret, filter } = await searchParams;
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) redirect("/");

  const admin = createAdminClient();
  const showAnswered = filter === "answered";
  const secretParam = `?secret=${secret}`;

  const [{ count: unansweredCount }, { count: answeredCount }] = await Promise.all([
    admin.from("chatbot_forwarded").select("*", { count: "exact", head: true }).is("team_answer", null),
    admin.from("chatbot_forwarded").select("*", { count: "exact", head: true }).not("team_answer", "is", null),
  ]);

  const { data: filteredItems } = await admin
    .from("chatbot_forwarded")
    .select("id, question, team_answer, user_email, published, created_at")
    .order("created_at", { ascending: false })
    .filter("team_answer", showAnswered ? "not.is" : "is", "null")
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
            <span>Forwarded Questions</span>
          </div>
          <h1 className="text-2xl font-bold">Forwarded Questions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Questions the chatbot could not answer. Answer them here and they will be added to the knowledge base.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 border-b pb-2">
          {[
            { key: "", label: "Needs Answer", count: unansweredCount ?? 0, color: "yellow" },
            { key: "answered", label: "Answered", count: answeredCount ?? 0, color: "green" },
          ].map(({ key, label, count, color }) => {
            const isActive = (filter ?? "") === key;
            const colorActive =
              color === "yellow"
                ? "border-yellow-500 text-yellow-700 dark:text-yellow-400"
                : "border-green-500 text-green-700 dark:text-green-400";
            return (
              <Link
                key={key}
                href={`/admin/forwarded${secretParam}${key ? `&filter=${key}` : ""}`}
                className={`px-3 py-1.5 text-sm font-medium border-b-2 transition-colors -mb-[2px] ${
                  isActive ? colorActive : "border-transparent text-muted-foreground hover:text-foreground"
                }`}
              >
                {label} {count > 0 && <span className="ml-1 tabular-nums">({count})</span>}
              </Link>
            );
          })}
        </div>

        {/* Items */}
        {!filteredItems || filteredItems.length === 0 ? (
          <div className="rounded-xl border bg-card p-12 text-center">
            <p className="text-2xl mb-2">{showAnswered ? "✅" : "🎉"}</p>
            <p className="font-medium">
              {showAnswered ? "No answered questions yet" : "No unanswered questions"}
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              {showAnswered
                ? "Answer questions from the Needs Answer tab and they will appear here."
                : "The chatbot will forward questions it cannot answer from its knowledge base."}
            </p>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredItems.map((item) => (
              <div key={item.id} className="rounded-xl border bg-card overflow-hidden">
                <div className="px-4 py-3 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-sm font-medium">{item.question}</p>
                    <span className="text-xs text-muted-foreground shrink-0">
                      {item.created_at ? new Date(item.created_at).toLocaleDateString() : ""}
                    </span>
                  </div>

                  {item.user_email && (
                    <p className="text-xs text-muted-foreground">
                      Follow-up requested by: {item.user_email}
                    </p>
                  )}

                  {item.team_answer ? (
                    <div className="space-y-2">
                      <div className="rounded-lg bg-green-50 dark:bg-green-900/10 px-3 py-2 text-sm text-green-800 dark:text-green-300 border border-green-200 dark:border-green-800">
                        {item.team_answer}
                      </div>
                      {item.published ? (
                        <p className="text-xs text-green-600 dark:text-green-400 font-medium">
                          Added to knowledge base
                        </p>
                      ) : (
                        <p className="text-xs text-muted-foreground">
                          Not yet published to knowledge base
                        </p>
                      )}
                    </div>
                  ) : (
                    <ForwardedAnswerForm itemId={item.id} adminSecret={secret ?? ""} />
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        <div className="rounded-lg border bg-muted/30 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground/80">How this works</p>
          <p className="mt-1">When you answer a question and check Publish to knowledge base, it is automatically added to the chatbot knowledge base. Future users asking similar questions will get the answer directly from the bot.</p>
        </div>

      </div>
    </div>
  );
}
