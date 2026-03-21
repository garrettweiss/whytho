/**
 * /admin/test-accounts — Test Politician Account Manager
 *
 * Lists all is_test=true politicians. From here you can:
 *   - View the profile
 *   - Start the claim flow (Tier 0 only)
 *   - Bypass verification → jump straight to Tier 2 (after claiming)
 *   - Reset → back to Tier 0 to re-test the full flow
 *
 * Protected by ?secret=ADMIN_SECRET
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { TestAccountActions } from "./test-accounts-actions";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

interface Props {
  searchParams: Promise<{ secret?: string }>;
}

export default async function TestAccountsPage({ searchParams }: Props) {
  const { secret } = await searchParams;

  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    redirect("/");
  }

  const admin = createAdminClient();

  // Fetch all test politicians + their team members
  const { data: politicians } = await admin
    .from("politicians")
    .select(`
      id,
      slug,
      full_name,
      office,
      state,
      verification_tier,
      politician_team (user_id, role)
    `)
    .eq("is_test", true)
    .order("created_at", { ascending: false });

  const rows = politicians ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">Test Accounts</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Fictional politicians for testing the full politician experience.
              Hidden from all public pages.
            </p>
          </div>
          <Link
            href={`/admin?secret=${secret}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Admin
          </Link>
        </div>

        {rows.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-muted-foreground text-sm">
            No test politicians yet. Run the seed script to create one.
          </div>
        ) : (
          <div className="space-y-3">
            {rows.map((p) => {
              const team = (p.politician_team ?? []) as { user_id: string; role: string }[];
              return (
                <TestAccountActions
                  key={p.id}
                  politician={{
                    id: p.id,
                    full_name: p.full_name,
                    office: p.office,
                    state: p.state,
                    verification_tier: p.verification_tier,
                    slug: p.slug,
                    isClaimed: team.length > 0,
                  }}
                  secret={secret}
                />
              );
            })}
          </div>
        )}

        <div className="rounded-lg border border-dashed p-4 text-xs text-muted-foreground space-y-1">
          <p className="font-semibold text-foreground">Full test flow:</p>
          <ol className="list-decimal list-inside space-y-1 pl-1">
            <li>Click <strong>Start Claim Flow →</strong> to go through the claim wizard</li>
            <li>After claiming (Tier 1), return here and click <strong>Bypass → Tier 2</strong></li>
            <li>Visit the profile and test the dashboard at <code>/dashboard</code></li>
            <li>When done, click <strong>Reset to Tier 0</strong> to start over</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
