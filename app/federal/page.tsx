import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PoliticianAvatar } from "@/components/politician/politician-avatar";

export const metadata: Metadata = {
  title: "Federal Representatives — WhyTho",
  description:
    "Browse all U.S. Senators and Representatives. See their question response rates and hold them accountable.",
};

export const revalidate = 3600;

const FEDERAL_OFFICES = [
  "U.S. Senator",
  "U.S. Representative",
  "President",
  "Vice President",
];

const STATE_NAMES: Record<string, string> = {
  AL: "Alabama", AK: "Alaska", AZ: "Arizona", AR: "Arkansas", CA: "California",
  CO: "Colorado", CT: "Connecticut", DE: "Delaware", FL: "Florida", GA: "Georgia",
  HI: "Hawaii", ID: "Idaho", IL: "Illinois", IN: "Indiana", IA: "Iowa",
  KS: "Kansas", KY: "Kentucky", LA: "Louisiana", ME: "Maine", MD: "Maryland",
  MA: "Massachusetts", MI: "Michigan", MN: "Minnesota", MS: "Mississippi", MO: "Missouri",
  MT: "Montana", NE: "Nebraska", NV: "Nevada", NH: "New Hampshire", NJ: "New Jersey",
  NM: "New Mexico", NY: "New York", NC: "North Carolina", ND: "North Dakota", OH: "Ohio",
  OK: "Oklahoma", OR: "Oregon", PA: "Pennsylvania", RI: "Rhode Island", SC: "South Carolina",
  SD: "South Dakota", TN: "Tennessee", TX: "Texas", UT: "Utah", VT: "Vermont",
  VA: "Virginia", WA: "Washington", WV: "West Virginia", WI: "Wisconsin", WY: "Wyoming",
  DC: "D.C.",
};

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

export default async function FederalPage({
  searchParams,
}: {
  searchParams: Promise<{ state?: string; chamber?: string }>;
}) {
  const { state, chamber } = await searchParams;
  const supabase = await createClient();

  let query = supabase
    .from("politicians")
    .select("id, slug, full_name, office, state, party, photo_url")
    .eq("is_active", true)
    .order("state", { ascending: true })
    .order("full_name", { ascending: true })
    .limit(600);

  if (state) {
    query = query.eq("state", state.toUpperCase());
  }

  if (chamber === "senate") {
    query = query.eq("office", "U.S. Senator");
  } else if (chamber === "house") {
    query = query.eq("office", "U.S. Representative");
  } else {
    query = query.in("office", FEDERAL_OFFICES);
  }

  const { data: politicians } = await query;

  // Group by state
  const byState: Record<string, typeof politicians> = {};
  for (const p of politicians ?? []) {
    const s = p.state ?? "Other";
    if (!byState[s]) byState[s] = [];
    byState[s]!.push(p);
  }
  const stateKeys = Object.keys(byState).sort();

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Federal Representatives</h1>
          <p className="mt-1 text-muted-foreground">
            U.S. Senators and Representatives · {(politicians ?? []).length} total
          </p>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          <Link
            href="/federal"
            className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
              !chamber ? "bg-foreground text-background" : "hover:bg-muted"
            }`}
          >
            All
          </Link>
          <Link
            href="/federal?chamber=senate"
            className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
              chamber === "senate" ? "bg-foreground text-background" : "hover:bg-muted"
            }`}
          >
            Senate
          </Link>
          <Link
            href="/federal?chamber=house"
            className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
              chamber === "house" ? "bg-foreground text-background" : "hover:bg-muted"
            }`}
          >
            House
          </Link>
        </div>

        {stateKeys.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">No politicians found. Run the seed script first.</p>
          </div>
        ) : (
          <div className="space-y-6">
            {stateKeys.map((stateCode) => (
              <div key={stateCode}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {STATE_NAMES[stateCode] ?? stateCode}
                </h2>
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
                  {byState[stateCode]!.map((p) => (
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
                        <p className="text-xs text-muted-foreground truncate">{p.office}</p>
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
