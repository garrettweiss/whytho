import Image from "next/image";
import { Tables, Enums } from "@/types/database";

interface Props {
  politician: Tables<"politicians">;
  currentParticipationRate: number | null;
}

const PARTY_COLORS: Record<string, string> = {
  Democrat: "bg-blue-100 text-blue-800",
  Republican: "bg-red-100 text-red-800",
  Independent: "bg-purple-100 text-purple-800",
  "Democratic-Farmer-Labor": "bg-blue-100 text-blue-800",
  Libertarian: "bg-yellow-100 text-yellow-800",
  Green: "bg-green-100 text-green-800",
};

const TIER_LABELS: Record<Enums<"verification_tier">, { label: string; color: string }> = {
  "0": { label: "Unclaimed", color: "text-muted-foreground" },
  "1": { label: "Self-Claimed", color: "text-amber-600" },
  "2": { label: "Verified ✓", color: "text-blue-600" },
  "3": { label: "Fully Verified ✓✓", color: "text-green-600" },
};

function PartyBadge({ party }: { party: string | null }) {
  if (!party) return null;
  const colorClass = PARTY_COLORS[party] ?? "bg-muted text-muted-foreground";
  const short =
    party === "Democrat" ? "D" :
    party === "Republican" ? "R" :
    party === "Independent" ? "I" :
    party === "Democratic-Farmer-Labor" ? "DFL" :
    party.slice(0, 1).toUpperCase();

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${colorClass}`}>
      {short} · {party}
    </span>
  );
}

function RateBadge({ rate }: { rate: number | null }) {
  if (rate === null) return (
    <span className="inline-flex items-center rounded-full px-3 py-1 text-sm font-medium bg-muted text-muted-foreground">
      No data yet
    </span>
  );

  const color =
    rate >= 75 ? "bg-green-100 text-green-800" :
    rate >= 40 ? "bg-yellow-100 text-yellow-800" :
    "bg-red-100 text-red-800";

  return (
    <span className={`inline-flex items-center rounded-full px-3 py-1 text-sm font-semibold ${color}`}>
      {Math.round(rate)}% response rate
    </span>
  );
}

type SocialHandles = {
  twitter?: string;
  facebook?: string;
  instagram?: string;
  youtube?: string;
};

export function PoliticianHeader({ politician, currentParticipationRate }: Props) {
  const tier = TIER_LABELS[politician.verification_tier];
  const social = (politician.social_handles ?? {}) as SocialHandles;

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm">
      <div className="flex gap-5 items-start">
        {/* Photo */}
        <div className="shrink-0">
          {politician.photo_url ? (
            <div className="relative h-20 w-20 overflow-hidden rounded-full border-2 border-border">
              <Image
                src={politician.photo_url}
                alt={politician.full_name}
                fill
                className="object-cover"
                sizes="80px"
              />
            </div>
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full border-2 border-border bg-muted text-2xl font-bold text-muted-foreground">
              {politician.full_name.slice(0, 1).toUpperCase()}
            </div>
          )}
        </div>

        {/* Info */}
        <div className="flex-1 min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-bold tracking-tight">{politician.full_name}</h1>
            <span className={`text-xs font-medium ${tier.color}`}>{tier.label}</span>
          </div>

          {politician.office && (
            <p className="text-sm text-muted-foreground">
              {politician.office}
              {politician.state && ` · ${politician.state}`}
              {politician.district && ` · ${politician.district}`}
            </p>
          )}

          <div className="flex flex-wrap gap-2">
            <PartyBadge party={politician.party} />
            <RateBadge rate={currentParticipationRate} />
          </div>
        </div>
      </div>

      {/* Bio */}
      {politician.bio && (
        <p className="mt-4 text-sm text-muted-foreground leading-relaxed line-clamp-3">
          {politician.bio}
        </p>
      )}

      {/* Links */}
      {(politician.website_url || social.twitter || social.facebook) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {politician.website_url && (
            <a
              href={politician.website_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              Official Website ↗
            </a>
          )}
          {social.twitter && (
            <a
              href={`https://twitter.com/${social.twitter}`}
              target="_blank"
              rel="noopener noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              @{social.twitter} ↗
            </a>
          )}
        </div>
      )}

      {/* Silence is its own answer tagline */}
      {currentParticipationRate === null && (
        <p className="mt-4 text-xs text-muted-foreground italic">
          Silence is its own answer.
        </p>
      )}
    </div>
  );
}
