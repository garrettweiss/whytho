import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PoliticianAvatar } from "@/components/politician/politician-avatar";
import { stateBySlug } from "@/lib/search/states";

interface Props {
  params: Promise<{ state: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { state: stateSlug } = await params;
  const stateEntry = stateBySlug(stateSlug);
  if (!stateEntry) return { title: "Region Not Found | WhyTho" };

  return {
    title: `${stateEntry.name} Politicians | WhyTho`,
    description: `Browse all politicians representing ${stateEntry.name} — federal and state level. Track their question response rates.`,
  };
}

function PartyBadge({ party }: { party: string | null }) {
  if (!party) return null;
  const short =
    party === "Democrat" ? "D" :
    party === "Republican" ? "R" :
    party === "Independent" ? "I" :
    party.slice(0, 1);
  const color =
    party === "Democrat" ? "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400" :
    party === "Republican" ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400" :
    "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${color}`}>
      {short}
    </span>
  );
}


function groupLabel(office: string | null): string {
  if (!office) return "Other";
  const o = office.toLowerCase();
  if (o.includes("u.s. senator") || (o.includes("senator") && !o.includes("state"))) return "U.S. Senate";
  if (o.includes("u.s. representative") || o.includes("u.s. rep")) return "U.S. House";
  if (o.includes("governor")) return "Governor";
  if (o.includes("state") && o.includes("senate")) return "State Senate";
  if (
    (o.includes("state") && (o.includes("house") || o.includes("representative") || o.includes("assembl"))) ||
    o.includes("state rep") ||
    o.includes("assemblymember")
  ) return "State House / Assembly";
  return "Other";
}

const GROUP_ORDER = [
  "U.S. Senate",
  "U.S. House",
  "Governor",
  "State Senate",
  "State House / Assembly",
  "Other",
];

export default async function RegionPage({ params }: Props) {
  const { state: stateSlug } = await params;
  const stateEntry = stateBySlug(stateSlug);

  if (!stateEntry) notFound();

  const supabase = await createClient();

  const { data: politicians } = await supabase
    .from("politicians")
    .select("id, slug, full_name, office, state, party, photo_url")
    .eq("is_active", true)
    .eq("is_test", false)
    .eq("state", stateEntry.code)
    .order("office", { ascending: true })
    .order("full_name", { ascending: true })
    .limit(500);

  // Group by office type
  const byGroup: Record<string, typeof politicians> = {};
  for (const p of politicians ?? []) {
    const group = groupLabel(p.office);
    if (!byGroup[group]) byGroup[group] = [];
    byGroup[group]!.push(p);
  }

  const groups = Object.keys(byGroup).sort(
    (a, b) => GROUP_ORDER.indexOf(a) - GROUP_ORDER.indexOf(b)
  );

  const total = (politicians ?? []).length;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <Link
            href="/"
            className="text-sm text-muted-foreground hover:text-foreground mb-3 inline-block transition-colors"
          >
            ← Home
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{stateEntry.name}</h1>
          <p className="mt-1 text-muted-foreground">
            {total > 0 ? `${total} politicians tracked` : "No politicians tracked yet"}
          </p>
        </div>

        {total === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              No politicians seeded yet for {stateEntry.name}.
            </p>
          </div>
        ) : (
          <div className="space-y-8">
            {groups.map((group) => (
              <div key={group}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {group} ({byGroup[group]!.length})
                </h2>
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
                  {byGroup[group]!.map((p) => (
                    <Link
                      key={p.id}
                      href={`/${p.slug}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
                    >
                      <PoliticianAvatar
                        photoUrl={p.photo_url}
                        fullName={p.full_name}
                        size={36}
                      />
                      <div className="flex-1 min-w-0">
                        <p className="font-medium truncate group-hover:underline underline-offset-2">
                          {p.full_name}
                        </p>
                        {p.office && (
                          <p className="text-xs text-muted-foreground truncate">{p.office}</p>
                        )}
                      </div>
                      <PartyBadge party={p.party} />
                    </Link>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
