import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = {
  title: "2026 Elections | WhyTho",
  description:
    "Track 2026 primary and general election candidates. Submit questions and hold candidates accountable before Election Day.",
};

export const revalidate = 3600;

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

const OFFICE_ORDER: Record<string, number> = {
  "Governor": 1,
  "U.S. Senator": 2,
  "U.S. Representative": 3,
};

type RaceRow = {
  id: string;
  slug: string;
  name: string;
  office: string;
  state: string;
  district: string | null;
  election_date: string;
  election_type: string;
  party: string | null;
  status: string;
  incumbent_id: string | null;
};

type FilterType = "all" | "governor" | "senate" | "house";

export default async function RacesPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string; state?: string }>;
}) {
  const { filter: filterParam, state: stateParam } = await searchParams;
  const filter: FilterType =
    filterParam === "governor" ? "governor" :
    filterParam === "senate" ? "senate" :
    filterParam === "house" ? "house" :
    "all";

  const supabase = await createClient();

  let query = supabase
    .from("races")
    .select("id, slug, name, office, state, district, election_date, election_type, party, status, incumbent_id")
    .eq("status", "active")
    .order("election_date", { ascending: true })
    .order("state", { ascending: true });

  if (filter === "governor") query = query.eq("office", "Governor");
  if (filter === "senate") query = query.eq("office", "U.S. Senator");
  if (filter === "house") query = query.eq("office", "U.S. Representative");
  if (stateParam) query = query.eq("state", stateParam.toUpperCase());

  const { data: races } = await query;
  const allRaces = (races ?? []) as RaceRow[];

  // Get candidate counts per race
  const raceIds = allRaces.map((r) => r.id);
  const { data: candidateCounts } = raceIds.length > 0
    ? await supabase
        .from("politicians")
        .select("race_id")
        .in("race_id", raceIds)
        .eq("politician_type", "candidate")
        .eq("is_active", true)
    : { data: [] };

  const countMap: Record<string, number> = {};
  for (const c of candidateCounts ?? []) {
    if (c.race_id) countMap[c.race_id] = (countMap[c.race_id] ?? 0) + 1;
  }

  // Group by state
  const byState: Record<string, RaceRow[]> = {};
  for (const race of allRaces) {
    const s = race.state ?? "Other";
    if (!byState[s]) byState[s] = [];
    byState[s]!.push(race);
  }

  // Sort races within each state by office order
  for (const state of Object.keys(byState)) {
    byState[state]!.sort(
      (a, b) => (OFFICE_ORDER[a.office] ?? 99) - (OFFICE_ORDER[b.office] ?? 99)
    );
  }

  const sortedStates = Object.keys(byState).sort();
  const total = allRaces.length;

  const govCount = allRaces.filter((r) => r.office === "Governor").length;
  const senCount = allRaces.filter((r) => r.office === "U.S. Senator").length;
  const houseCount = allRaces.filter((r) => r.office === "U.S. Representative").length;

  const PILLS = [
    { value: "all" as FilterType, label: "All Races", count: allRaces.length > 0 ? total : null },
    { value: "governor" as FilterType, label: "Governor", count: govCount || null },
    { value: "senate" as FilterType, label: "Senate", count: senCount || null },
    { value: "house" as FilterType, label: "House", count: houseCount || null },
  ];

  function electionLabel(race: RaceRow) {
    const label = race.election_type === "general" ? "General" : "Primary";
    const date = race.election_date
      ? new Date(race.election_date + "T12:00:00").toLocaleDateString("en-US", {
          month: "short", day: "numeric", year: "numeric",
        })
      : null;
    return date ? `${label} · ${date}` : label;
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">2026 Elections</h1>
          <p className="mt-1 text-muted-foreground">
            {total > 0
              ? `${total} active race${total !== 1 ? "s" : ""}, ask candidates where they stand`
              : "No races added yet. Check back soon"}
          </p>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          {PILLS.map((pill) => (
            <Link
              key={pill.value}
              href={pill.value === "all" ? "/races" : `/races?filter=${pill.value}`}
              className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                filter === pill.value ? "bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              {pill.label}
              {pill.count !== null && (
                <span className="ml-1 text-xs opacity-60">({pill.count})</span>
              )}
            </Link>
          ))}
        </div>

        {total === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">No races found. Run the seed script to add candidates.</p>
          </div>
        ) : (
          <div className="space-y-8">
            {sortedStates.map((stateCode) => (
              <div key={stateCode}>
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                  {STATE_NAMES[stateCode] ?? stateCode}
                </h2>
                <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
                  {byState[stateCode]!.map((race) => {
                    const candidateCount = countMap[race.id] ?? 0;
                    const hasIncumbent = !!race.incumbent_id;
                    return (
                      <Link
                        key={race.id}
                        href={`/races/${race.slug}`}
                        className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
                      >
                        <div className="min-w-0">
                          <p className="font-medium truncate group-hover:underline underline-offset-2">
                            {race.name}
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {electionLabel(race)}
                            {hasIncumbent && " · Incumbent running"}
                          </p>
                        </div>
                        <div className="shrink-0 flex items-center gap-2">
                          {candidateCount > 0 && (
                            <span className="text-xs text-muted-foreground">
                              {candidateCount} candidate{candidateCount !== 1 ? "s" : ""}
                            </span>
                          )}
                          {race.party && (
                            <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${
                              race.party === "Democrat" ? "bg-blue-100 text-blue-800" :
                              race.party === "Republican" ? "bg-red-100 text-red-800" :
                              "bg-muted text-muted-foreground"
                            }`}>
                              {race.party === "Democrat" ? "D" : race.party === "Republican" ? "R" : race.party.slice(0, 1)}
                            </span>
                          )}
                        </div>
                      </Link>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
