import type { Metadata } from "next";
import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { PoliticianAvatar } from "@/components/politician/politician-avatar";

export const metadata: Metadata = {
  title: "U.S. Officials | WhyTho",
  description:
    "Browse the President, Cabinet, Governors, U.S. Senators, and Representatives. See their question response rates and hold them accountable.",
};

export const revalidate = 3600;

const EXECUTIVE_OFFICES = [
  "President",
  "Vice President",
  "Secretary of State",
  "Secretary of Defense",
  "Secretary of the Treasury",
  "Attorney General",
  "Secretary of Homeland Security",
  "Secretary of Health and Human Services",
  "Secretary of Education",
  "Secretary of Energy",
  "Secretary of Agriculture",
  "Secretary of Commerce",
  "Secretary of Labor",
  "Secretary of Transportation",
  "Secretary of Housing and Urban Development",
  "Secretary of Veterans Affairs",
  "Secretary of the Interior",
  "White House Chief of Staff",
  "National Security Advisor",
  "OMB Director",
  "CIA Director",
  "U.S. Ambassador to the United Nations",
  "EPA Administrator",
  "U.S. Trade Representative",
];

// Display order for executive branch
const EXECUTIVE_ORDER: Record<string, number> = {
  "President": 1,
  "Vice President": 2,
  "Secretary of State": 3,
  "Secretary of Defense": 4,
  "Secretary of the Treasury": 5,
  "Attorney General": 6,
  "Secretary of Homeland Security": 7,
  "Secretary of Health and Human Services": 8,
  "Secretary of Education": 9,
  "Secretary of Energy": 10,
  "Secretary of Agriculture": 11,
  "Secretary of Commerce": 12,
  "Secretary of Labor": 13,
  "Secretary of Transportation": 14,
  "Secretary of Housing and Urban Development": 15,
  "Secretary of Veterans Affairs": 16,
  "Secretary of the Interior": 17,
  "White House Chief of Staff": 18,
  "National Security Advisor": 19,
  "OMB Director": 20,
  "CIA Director": 21,
  "U.S. Ambassador to the United Nations": 22,
  "EPA Administrator": 23,
  "U.S. Trade Representative": 24,
};

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

function PoliticianRow({ p }: { p: { id: string; slug: string; full_name: string; office: string | null; state: string | null; party: string | null; photo_url: string | null } }) {
  return (
    <Link
      href={`/${p.slug}`}
      className="flex items-center gap-3 px-4 py-3 hover:bg-muted/50 transition-colors group"
    >
      <PoliticianAvatar photoUrl={p.photo_url} fullName={p.full_name} size={36} />
      <div className="flex-1 min-w-0">
        <p className="font-medium truncate group-hover:underline underline-offset-2">
          {p.full_name}
        </p>
        <p className="text-xs text-muted-foreground truncate">{p.office}</p>
      </div>
      <PartyBadge party={p.party} />
    </Link>
  );
}

type Chamber = "all" | "executive" | "senate" | "house" | "governors";

export default async function FederalPage({
  searchParams,
}: {
  searchParams: Promise<{ chamber?: string }>;
}) {
  const { chamber: chamberParam } = await searchParams;
  const chamber: Chamber =
    chamberParam === "executive" ? "executive" :
    chamberParam === "senate" ? "senate" :
    chamberParam === "house" ? "house" :
    chamberParam === "governors" ? "governors" :
    "all";

  const supabase = await createClient();
  const sel = "id, slug, full_name, office, state, party, photo_url";

  // Always fetch all four groups - filter in UI based on `chamber`
  const [execRes, govRes, senRes, houseRes] = await Promise.all([
    supabase.from("politicians").select(sel).eq("is_active", true).eq("is_test", false).in("office", EXECUTIVE_OFFICES).order("full_name"),
    supabase.from("politicians").select(sel).eq("is_active", true).eq("is_test", false).eq("office", "Governor").order("state").order("full_name"),
    supabase.from("politicians").select(sel).eq("is_active", true).eq("is_test", false).eq("office", "U.S. Senator").order("state").order("full_name").limit(110),
    supabase.from("politicians").select(sel).eq("is_active", true).eq("is_test", false).eq("office", "U.S. Representative").order("state").order("full_name").limit(450),
  ]);

  const executive = [...(execRes.data ?? [])].sort(
    (a, b) => (EXECUTIVE_ORDER[a.office ?? ""] ?? 99) - (EXECUTIVE_ORDER[b.office ?? ""] ?? 99)
  );
  const governors = govRes.data ?? [];
  const senators = senRes.data ?? [];
  const representatives = houseRes.data ?? [];

  // Group senators + reps by state
  function groupByState<T extends { state: string | null }>(arr: T[]) {
    const map: Record<string, T[]> = {};
    for (const p of arr) {
      const s = p.state ?? "Other";
      if (!map[s]) map[s] = [];
      map[s]!.push(p);
    }
    return map;
  }

  const govByState = groupByState(governors);
  const senByState = groupByState(senators);
  const houseByState = groupByState(representatives);

  const totalVisible =
    (chamber === "all" ? executive.length + governors.length + senators.length + representatives.length :
    chamber === "executive" ? executive.length :
    chamber === "governors" ? governors.length :
    chamber === "senate" ? senators.length :
    representatives.length);

  const PILLS: { value: Chamber; label: string; count: number }[] = [
    { value: "all",       label: "All",       count: executive.length + governors.length + senators.length + representatives.length },
    { value: "executive", label: "Executive", count: executive.length },
    { value: "governors", label: "Governors", count: governors.length },
    { value: "senate",    label: "Senate",    count: senators.length },
    { value: "house",     label: "House",     count: representatives.length },
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">U.S. Officials</h1>
          <p className="mt-1 text-muted-foreground">
            {totalVisible} official{totalVisible !== 1 ? "s" : ""}
          </p>
        </div>

        {/* Filter pills */}
        <div className="flex flex-wrap gap-2">
          {PILLS.map((pill) => (
            <Link
              key={pill.value}
              href={pill.value === "all" ? "/federal" : `/federal?chamber=${pill.value}`}
              className={`rounded-full px-3 py-1 text-sm font-medium border transition-colors ${
                chamber === pill.value ? "bg-foreground text-background" : "hover:bg-muted"
              }`}
            >
              {pill.label}
              {pill.count > 0 && (
                <span className="ml-1 text-xs opacity-60">({pill.count})</span>
              )}
            </Link>
          ))}
        </div>

        <div className="space-y-8">

          {/* ── Executive Branch ───────────────────────────────── */}
          {(chamber === "all" || chamber === "executive") && executive.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Executive Branch ({executive.length})
              </h2>
              <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
                {executive.map((p) => <PoliticianRow key={p.id} p={p} />)}
              </div>
            </div>
          )}

          {/* ── Governors ──────────────────────────────────────── */}
          {(chamber === "all" || chamber === "governors") && governors.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                Governors ({governors.length})
              </h2>
              <div className="space-y-4">
                {Object.keys(govByState).sort().map((stateCode) => (
                  <div key={stateCode}>
                    <p className="text-xs font-medium text-muted-foreground mb-1 pl-1">
                      {STATE_NAMES[stateCode] ?? stateCode}
                    </p>
                    <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
                      {govByState[stateCode]!.map((p) => <PoliticianRow key={p.id} p={p} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── U.S. Senate ────────────────────────────────────── */}
          {(chamber === "all" || chamber === "senate") && senators.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                U.S. Senate ({senators.length})
              </h2>
              <div className="space-y-4">
                {Object.keys(senByState).sort().map((stateCode) => (
                  <div key={stateCode}>
                    <p className="text-xs font-medium text-muted-foreground mb-1 pl-1">
                      {STATE_NAMES[stateCode] ?? stateCode}
                    </p>
                    <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
                      {senByState[stateCode]!.map((p) => <PoliticianRow key={p.id} p={p} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── U.S. House ─────────────────────────────────────── */}
          {(chamber === "all" || chamber === "house") && representatives.length > 0 && (
            <div>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                U.S. House ({representatives.length})
              </h2>
              <div className="space-y-4">
                {Object.keys(houseByState).sort().map((stateCode) => (
                  <div key={stateCode}>
                    <p className="text-xs font-medium text-muted-foreground mb-1 pl-1">
                      {STATE_NAMES[stateCode] ?? stateCode}
                    </p>
                    <div className="rounded-xl border bg-card shadow-sm overflow-hidden divide-y">
                      {houseByState[stateCode]!.map((p) => <PoliticianRow key={p.id} p={p} />)}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {totalVisible === 0 && (
            <div className="rounded-xl border bg-card p-8 text-center">
              <p className="text-muted-foreground">No politicians found. Run the seed script first.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
