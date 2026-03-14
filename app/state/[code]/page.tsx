import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import Image from "next/image";
import { createClient } from "@/lib/supabase/server";

const TARGET_STATES: Record<string, string> = {
  ca: "California",
  tx: "Texas",
  fl: "Florida",
  ny: "New York",
  pa: "Pennsylvania",
  oh: "Ohio",
  ga: "Georgia",
  nc: "North Carolina",
  mi: "Michigan",
  az: "Arizona",
};

// Exclude federal offices — state page shows state-level only
const FEDERAL_OFFICES = ["U.S. Senator", "U.S. Representative", "President", "Vice President"];

interface Props {
  params: Promise<{ code: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { code } = await params;
  const stateName = TARGET_STATES[code.toLowerCase()];
  if (!stateName) return { title: "State Not Found — WhyTho" };

  return {
    title: `${stateName} State Politicians — WhyTho`,
    description: `Browse ${stateName} state legislators and governors. See their question response rates.`,
  };
}

export async function generateStaticParams() {
  return Object.keys(TARGET_STATES).map((code) => ({ code }));
}

function PartyBadge({ party }: { party: string | null }) {
  if (!party) return null;
  const short =
    party === "Democrat" ? "D" :
    party === "Republican" ? "R" :
    party === "Independent" ? "I" :
    party.slice(0, 1);
  const color =
    party === "Democrat" ? "bg-blue-100 text-blue-800" :
    party === "Republican" ? "bg-red-100 text-red-800" :
    "bg-muted text-muted-foreground";
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${color}`}>
      {short}
    </span>
  );
}

export default async function StatePage({ params }: Props) {
  const { code } = await params;
  const stateCode = code.toLowerCase();
  const stateName = TARGET_STATES[stateCode];

  if (!stateName) notFound();

  const supabase = await createClient();

  const { data: politicians } = await supabase
    .from("politicians")
    .select("id, slug, full_name, office, state, party, photo_url")
    .eq("is_active", true)
    .eq("state", stateCode.toUpperCase())
    .not("office", "in", `(${FEDERAL_OFFICES.map((o) => `"${o}"`).join(",")})`)
    .order("office", { ascending: true })
    .order("full_name", { ascending: true })
    .limit(300);

  // Group by chamber/office type
  const byOffice: Record<string, typeof politicians> = {};
  for (const p of politicians ?? []) {
    const office = p.office ?? "Other";
    // Normalize chamber grouping
    const group =
      office.toLowerCase().includes("senate") ? "State Senate" :
      office.toLowerCase().includes("house") || office.toLowerCase().includes("assembl") || office.toLowerCase().includes("represent") ? "State House" :
      office.toLowerCase().includes("governor") ? "Governor" :
      "Other";
    if (!byOffice[group]) byOffice[group] = [];
    byOffice[group]!.push(p);
  }

  // Sort groups: Governor, State Senate, State House, Other
  const ORDER = ["Governor", "State Senate", "State House", "Other"];
  const groups = Object.keys(byOffice).sort(
    (a, b) => ORDER.indexOf(a) - ORDER.indexOf(b)
  );

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <Link
            href="/federal"
            className="text-sm text-muted-foreground hover:text-foreground mb-3 inline-block"
          >
            ← All States
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">{stateName}</h1>
          <p className="mt-1 text-muted-foreground">
            State legislators · {(politicians ?? []).length} total
          </p>
        </div>

        {politicians?.length === 0 || !politicians ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              No state politicians seeded yet for {stateName}.
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              Run the seed script with OpenStates data to populate.
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {groups.map((group) => (
              <div key={group}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {group} ({byOffice[group]!.length})
                </h2>
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
                  {byOffice[group]!.map((p) => (
                    <Link
                      key={p.id}
                      href={`/${p.slug}`}
                      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
                    >
                      {p.photo_url ? (
                        <div className="relative h-9 w-9 overflow-hidden rounded-full border border-border shrink-0">
                          <Image
                            src={p.photo_url}
                            alt={p.full_name}
                            fill
                            className="object-cover"
                            sizes="36px"
                          />
                        </div>
                      ) : (
                        <div className="flex h-9 w-9 items-center justify-center rounded-full border border-border bg-muted text-sm font-bold text-muted-foreground shrink-0">
                          {p.full_name.slice(0, 1)}
                        </div>
                      )}
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
