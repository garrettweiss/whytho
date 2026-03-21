import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { PoliticianAvatar } from "@/components/politician/politician-avatar";

export const revalidate = 3600;

type Props = { params: Promise<{ slug: string }> };

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
  const color =
    party === "Democrat" ? "bg-blue-100 text-blue-800" :
    party === "Republican" ? "bg-red-100 text-red-800" :
    "bg-muted text-muted-foreground";
  const short =
    party === "Democrat" ? "D" :
    party === "Republican" ? "R" :
    party === "Independent" ? "I" :
    party.slice(0, 1);
  return (
    <span className={`inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold ${color}`}>
      {short} · {party}
    </span>
  );
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: race } = await supabase
    .from("races")
    .select("name, office, state")
    .eq("slug", slug)
    .maybeSingle();

  if (!race) return { title: "Race | WhyTho" };
  return {
    title: `${race.name} | WhyTho`,
    description: `${race.office} race in ${STATE_NAMES[race.state ?? ""] ?? race.state}. Ask candidates where they stand.`,
  };
}

export default async function RaceDetailPage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: race } = await supabase
    .from("races")
    .select("id, slug, name, office, state, district, election_date, election_type, party, status, incumbent_id")
    .eq("slug", slug)
    .maybeSingle();

  if (!race) notFound();

  // Fetch incumbent
  const incumbent = race.incumbent_id
    ? (await supabase
        .from("politicians")
        .select("id, slug, full_name, party, photo_url, office, state, district")
        .eq("id", race.incumbent_id)
        .maybeSingle()
      ).data
    : null;

  // Fetch candidates
  const { data: candidates } = await supabase
    .from("politicians")
    .select("id, slug, full_name, party, photo_url, candidate_status")
    .eq("race_id", race.id)
    .eq("politician_type", "candidate")
    .eq("is_active", true)
    .order("full_name");

  const electionDate = race.election_date
    ? new Date(race.election_date + "T12:00:00").toLocaleDateString("en-US", {
        weekday: "long", month: "long", day: "numeric", year: "numeric",
      })
    : null;

  const isOver = race.status === "completed";
  const stateName = STATE_NAMES[race.state ?? ""] ?? race.state;
  const electionTypeLabel =
    race.election_type === "general" ? "General Election" :
    race.election_type === "runoff" ? "Runoff" :
    "Primary";

  type Candidate = {
    id: string;
    slug: string;
    full_name: string;
    party: string | null;
    photo_url: string | null;
    candidate_status: string | null;
  };

  function CandidateRow({ p, isIncumbent }: { p: Candidate | typeof incumbent; isIncumbent?: boolean }) {
    if (!p) return null;
    const cand = p as Candidate;
    const won = cand.candidate_status === "won";
    const lost = cand.candidate_status === "lost";
    return (
      <Link
        href={`/${cand.slug}`}
        className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
      >
        <PoliticianAvatar photoUrl={cand.photo_url} fullName={cand.full_name} size={40} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="font-medium truncate group-hover:underline underline-offset-2">
              {cand.full_name}
            </p>
            {isIncumbent && (
              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold bg-muted text-muted-foreground">
                Incumbent
              </span>
            )}
            {won && (
              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold bg-green-100 text-green-800">
                Won ✓
              </span>
            )}
            {lost && (
              <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-xs font-semibold bg-muted text-muted-foreground">
                Did not advance
              </span>
            )}
          </div>
        </div>
        <PartyBadge party={cand.party} />
      </Link>
    );
  }

  const allCandidates = candidates ?? [];
  const hasCandidates = allCandidates.length > 0;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Breadcrumb */}
        <nav className="text-sm text-muted-foreground flex items-center gap-1.5">
          <Link href="/races" className="hover:text-foreground hover:underline underline-offset-2">
            Elections
          </Link>
          <span>›</span>
          <span>{stateName}</span>
        </nav>

        {/* Race header */}
        <div className="rounded-xl border bg-card p-6 shadow-sm space-y-3">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{race.name}</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {electionTypeLabel}
              {stateName && ` · ${stateName}`}
              {race.district && ` · ${race.district}`}
            </p>
          </div>

          {electionDate && (
            <div className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium ${
              isOver ? "bg-muted text-muted-foreground" : "bg-orange-50 text-orange-800 border border-orange-200"
            }`}>
              {isOver ? "Election concluded" : `🗓️ ${electionDate}`}
            </div>
          )}

          <p className="text-sm text-muted-foreground">
            Ask any candidate a question. Their response rate is always public.
          </p>
        </div>

        {/* Incumbent */}
        {incumbent && (
          <div>
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
              Current Officeholder
            </h2>
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden">
              <CandidateRow p={incumbent as unknown as Candidate} isIncumbent />
            </div>
          </div>
        )}

        {/* Candidates */}
        <div>
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
            {hasCandidates
              ? `Candidates (${allCandidates.length})`
              : "Candidates"}
          </h2>
          {hasCandidates ? (
            <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
              {allCandidates.map((c) => (
                <CandidateRow key={c.id} p={c} />
              ))}
            </div>
          ) : (
            <div className="rounded-xl border bg-card p-6 text-center">
              <p className="text-muted-foreground text-sm">
                Candidates will be listed here once added. Check back soon.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
