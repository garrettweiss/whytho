"use client";

import { useState } from "react";

interface TestPolitician {
  id: string;
  full_name: string;
  office: string | null;
  state: string | null;
  verification_tier: string;
  slug: string;
  isClaimed: boolean;
}

export function TestAccountActions({ politician, secret }: { politician: TestPolitician; secret: string }) {
  const [tier, setTier] = useState(politician.verification_tier);
  const [isClaimed, setIsClaimed] = useState(politician.isClaimed);
  const [loading, setLoading] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function callAdmin(endpoint: string) {
    setLoading(endpoint);
    setMsg(null);
    try {
      const res = await fetch(`/api/admin/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${secret}`,
        },
        body: JSON.stringify({ politician_id: politician.id }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(`Error: ${data.error}`);
      } else {
        if (endpoint === "bypass-verification") {
          setTier("2");
          setMsg("Upgraded to Tier 2 (Verified)");
        } else if (endpoint === "reset-test-politician") {
          setTier("0");
          setIsClaimed(false);
          setMsg("Reset to Tier 0 — ready to re-test claim flow");
        }
      }
    } catch {
      setMsg("Request failed");
    } finally {
      setLoading(null);
    }
  }

  const tierLabel: Record<string, string> = {
    "0": "Tier 0 — Unclaimed",
    "1": "Tier 1 — Self-Claimed",
    "2": "Tier 2 — Verified ✓",
    "3": "Tier 3 — Fully Verified ✓✓",
  };

  const tierColor: Record<string, string> = {
    "0": "bg-muted text-muted-foreground",
    "1": "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400",
    "2": "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400",
    "3": "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  };

  return (
    <div className="rounded-lg border p-4 space-y-3">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="font-semibold">{politician.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {politician.office ?? "—"} · {politician.state ?? "—"}
          </p>
          <p className="text-xs text-muted-foreground font-mono mt-0.5">/{politician.slug}</p>
        </div>
        <span className={`text-xs font-medium px-2 py-1 rounded-full shrink-0 ${tierColor[tier] ?? tierColor["0"]}`}>
          {tierLabel[tier] ?? `Tier ${tier}`}
        </span>
      </div>

      <div className="flex flex-wrap gap-2">
        <a
          href={`/${politician.slug}`}
          target="_blank"
          className="inline-flex items-center px-3 py-1.5 text-xs rounded border hover:bg-muted transition-colors"
        >
          View Profile →
        </a>

        {tier === "1" && (
          <button
            onClick={() => callAdmin("bypass-verification")}
            disabled={loading !== null}
            className="inline-flex items-center px-3 py-1.5 text-xs rounded bg-green-600 text-white hover:bg-green-700 disabled:opacity-50 transition-colors"
          >
            {loading === "bypass-verification" ? "Upgrading..." : "Bypass → Tier 2"}
          </button>
        )}

        {tier !== "0" && (
          <button
            onClick={() => callAdmin("reset-test-politician")}
            disabled={loading !== null}
            className="inline-flex items-center px-3 py-1.5 text-xs rounded bg-destructive text-destructive-foreground hover:bg-destructive/90 disabled:opacity-50 transition-colors"
          >
            {loading === "reset-test-politician" ? "Resetting..." : "Reset to Tier 0"}
          </button>
        )}

        {tier === "0" && !isClaimed && (
          <a
            href={`/verify?prefill=${politician.id}`}
            className="inline-flex items-center px-3 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
          >
            Start Claim Flow →
          </a>
        )}
      </div>

      {msg && (
        <p className="text-xs text-muted-foreground border-t pt-2">{msg}</p>
      )}
    </div>
  );
}
