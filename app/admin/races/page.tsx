/**
 * /admin/races: Race & Candidate lifecycle management
 *
 * Auth: ?secret=ADMIN_SECRET query param
 * Actions:
 *   - View all races (active / completed)
 *   - Mark a candidate as won / lost
 *   - Mark a race as completed
 *   - See incumbent + candidate counts per race
 */

import { redirect } from "next/navigation";
import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/server";
import { RaceActions } from "./race-actions";

const ADMIN_SECRET = process.env.ADMIN_SECRET;

interface Props {
  searchParams: Promise<{ secret?: string; status?: string }>;
}

export default async function AdminRacesPage({ searchParams }: Props) {
  const { secret, status: statusParam } = await searchParams;
  if (!ADMIN_SECRET || secret !== ADMIN_SECRET) {
    redirect(`/admin?secret=${secret ?? ""}`);
  }

  const supabase = await createAdminClient();
  const showCompleted = statusParam === "completed";

  const { data: races } = await supabase
    .from("races")
    .select("id, slug, name, office, state, district, election_date, election_type, status, incumbent_id")
    .eq("status", showCompleted ? "completed" : "active")
    .order("election_date", { ascending: true })
    .order("state");

  // Get candidate counts + incumbents
  const raceIds = (races ?? []).map((r) => r.id);
  const [candidatesRes, incumbentsRes] = await Promise.all([
    raceIds.length > 0
      ? supabase
          .from("politicians")
          .select("id, full_name, slug, party, race_id, candidate_status")
          .in("race_id", raceIds)
          .eq("politician_type", "candidate")
      : { data: [] },
    raceIds.length > 0
      ? supabase
          .from("politicians")
          .select("id, full_name, slug, party")
          .in("id", (races ?? []).filter((r) => r.incumbent_id).map((r) => r.incumbent_id!))
      : { data: [] },
  ]);

  type CandidateRow = {
    id: string;
    full_name: string;
    slug: string;
    party: string | null;
    race_id: string | null;
    candidate_status: string | null;
  };
  const candidatesByRace = new Map<string, CandidateRow[]>();
  for (const c of (candidatesRes.data ?? []) as CandidateRow[]) {
    if (!c.race_id) continue;
    if (!candidatesByRace.has(c.race_id)) candidatesByRace.set(c.race_id, []);
    candidatesByRace.get(c.race_id)!.push(c);
  }

  const incumbentMap = new Map<string, { id: string; full_name: string; slug: string; party: string | null }>();
  for (const inc of incumbentsRes.data ?? []) {
    incumbentMap.set(inc.id, inc);
  }

  const allRaces = races ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-8 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Race Management</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Mark election results and manage candidate lifecycle
            </p>
          </div>
          <Link
            href={`/admin?secret=${secret}`}
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            ← Admin
          </Link>
        </div>

        {/* Status tabs */}
        <div className="flex gap-1 rounded-lg border bg-muted p-1 w-fit">
          <Link
            href={`/admin/races?secret=${secret}`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              !showCompleted ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Active ({!showCompleted ? allRaces.length : "-"})
          </Link>
          <Link
            href={`/admin/races?secret=${secret}&status=completed`}
            className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
              showCompleted ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            Completed
          </Link>
        </div>

        {allRaces.length === 0 ? (
          <div className="rounded-xl border bg-card p-8 text-center">
            <p className="text-muted-foreground">
              {showCompleted ? "No completed races yet." : "No active races. Run seed scripts to populate."}
            </p>
            {!showCompleted && (
              <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                <p>To add races, run:</p>
                <code className="block rounded bg-muted px-3 py-2 text-xs font-mono text-left">
                  npx tsx scripts/seed-governor-races.ts{"\n"}
                  npx tsx scripts/ingest-fec-candidates.ts
                </code>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {allRaces.map((race) => {
              const candidates = candidatesByRace.get(race.id) ?? [];
              const incumbent = race.incumbent_id ? incumbentMap.get(race.incumbent_id) : null;
              const electionDate = race.election_date
                ? new Date(race.election_date + "T12:00:00").toLocaleDateString("en-US", {
                    month: "short", day: "numeric", year: "numeric",
                  })
                : null;

              return (
                <div key={race.id} className="rounded-xl border bg-card p-4 space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <h3 className="font-semibold">{race.name}</h3>
                        <span className={`text-xs rounded-full px-2 py-0.5 font-medium ${
                          race.status === "active" ? "bg-orange-100 text-orange-800" : "bg-muted text-muted-foreground"
                        }`}>
                          {race.election_type}
                        </span>
                      </div>
                      {electionDate && (
                        <p className="text-xs text-muted-foreground mt-0.5">{electionDate}</p>
                      )}
                    </div>
                    <Link
                      href={`/races/${race.slug}`}
                      target="_blank"
                      className="text-xs text-muted-foreground hover:text-foreground"
                    >
                      View ↗
                    </Link>
                  </div>

                  {/* Incumbent */}
                  {incumbent && (
                    <div className="text-sm">
                      <span className="text-muted-foreground">Incumbent: </span>
                      <Link href={`/${incumbent.slug}`} target="_blank" className="hover:underline">
                        {incumbent.full_name}
                      </Link>
                      {incumbent.party && (
                        <span className="ml-1 text-muted-foreground">({incumbent.party})</span>
                      )}
                    </div>
                  )}

                  {/* Candidates */}
                  {candidates.length > 0 ? (
                    <div className="space-y-2">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                        Candidates ({candidates.length})
                      </p>
                      <div className="rounded-lg border divide-y overflow-hidden">
                        {candidates.map((c) => (
                          <div key={c.id} className="flex items-center justify-between gap-3 px-3 py-2">
                            <div className="flex items-center gap-2">
                              <Link href={`/${c.slug}`} target="_blank" className="text-sm font-medium hover:underline">
                                {c.full_name}
                              </Link>
                              {c.party && (
                                <span className="text-xs text-muted-foreground">({c.party})</span>
                              )}
                              {c.candidate_status && c.candidate_status !== "active" && (
                                <span className={`text-xs rounded-full px-1.5 py-0.5 font-medium ${
                                  c.candidate_status === "won" ? "bg-green-100 text-green-800" :
                                  c.candidate_status === "lost" ? "bg-muted text-muted-foreground" :
                                  "bg-yellow-100 text-yellow-800"
                                }`}>
                                  {c.candidate_status}
                                </span>
                              )}
                            </div>
                            {race.status === "active" && (
                              <RaceActions
                                secret={secret ?? ""}
                                candidateId={c.id}
                                candidateName={c.full_name}
                                raceId={race.id}
                                currentStatus={c.candidate_status ?? "active"}
                              />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <p className="text-xs text-muted-foreground">No candidates linked yet.</p>
                  )}

                  {/* Race-level action */}
                  {race.status === "active" && (
                    <RaceActions
                      secret={secret ?? ""}
                      raceId={race.id}
                      raceName={race.name}
                      markRaceComplete
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
