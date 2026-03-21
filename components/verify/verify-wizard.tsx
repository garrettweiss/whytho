"use client";

import { useState, useEffect, useRef, useTransition } from "react";
import Link from "next/link";
import { useUser } from "@/lib/auth/use-user";

// ── Types ─────────────────────────────────────────────────────────────────────

type PoliticianResult = {
  id: string;
  slug: string;
  full_name: string;
  office: string | null;
  state: string | null;
  party: string | null;
  photo_url: string | null;
};

type WizardStep = "find" | "claim" | "methods" | "done";

type MethodStatus = "idle" | "in_progress" | "done";

// ── Helpers ───────────────────────────────────────────────────────────────────

function StepIndicator({ current, total }: { current: number; total: number }) {
  return (
    <div className="flex items-center gap-2 mb-8">
      {Array.from({ length: total }, (_, i) => (
        <div key={i} className="flex items-center gap-2">
          <div
            className={`h-7 w-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              i + 1 < current
                ? "bg-green-500 text-white"
                : i + 1 === current
                ? "bg-primary text-primary-foreground"
                : "bg-muted text-muted-foreground"
            }`}
          >
            {i + 1 < current ? "✓" : i + 1}
          </div>
          {i < total - 1 && (
            <div
              className={`h-0.5 w-8 transition-colors ${
                i + 1 < current ? "bg-green-500" : "bg-muted"
              }`}
            />
          )}
        </div>
      ))}
    </div>
  );
}

// ── Step 1: Find politician ───────────────────────────────────────────────────

function StepFind({
  onSelect,
}: {
  onSelect: (politician: PoliticianResult) => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PoliticianResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wrapperRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);

    if (query.trim().length < 2) {
      setResults([]);
      setIsOpen(false);
      return;
    }

    debounceRef.current = setTimeout(async () => {
      setIsLoading(true);
      try {
        const res = await fetch(
          `/api/politicians/search?q=${encodeURIComponent(query.trim())}`
        );
        if (res.ok) {
          const data = (await res.json()) as { politicians: PoliticianResult[] };
          setResults(data.politicians ?? []);
          setIsOpen(true);
        }
      } catch {
        // Fail silently
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Find your profile</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Search for the politician profile you want to claim. Profiles are created from
        public records and are ready to be claimed by the elected official.
      </p>

      <div ref={wrapperRef} className="relative">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => results.length > 0 && setIsOpen(true)}
          placeholder="Search by name, office, or state…"
          className="w-full rounded-lg border bg-background px-4 py-3 pr-10 text-sm shadow-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          autoFocus
        />
        <div className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none">
          {isLoading ? (
            <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
            </svg>
          ) : (
            <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          )}
        </div>

        {isOpen && results.length > 0 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover shadow-lg overflow-hidden">
            <ul className="divide-y divide-border max-h-72 overflow-y-auto">
              {results.map((r) => (
                <li key={r.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setQuery(r.full_name);
                      onSelect(r);
                    }}
                    className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted transition-colors text-left"
                  >
                    <div className="shrink-0 flex h-9 w-9 items-center justify-center rounded-full border bg-muted text-xs font-bold text-muted-foreground overflow-hidden">
                      {r.photo_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={r.photo_url} alt={r.full_name} className="h-full w-full object-cover" />
                      ) : (
                        r.full_name.slice(0, 1).toUpperCase()
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{r.full_name}</p>
                      <p className="text-xs text-muted-foreground truncate">
                        {[r.office, r.state].filter(Boolean).join(" · ")}
                        {r.party && ` · ${r.party}`}
                      </p>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {isOpen && !isLoading && results.length === 0 && query.trim().length >= 2 && (
          <div className="absolute z-10 mt-1 w-full rounded-lg border bg-popover px-4 py-3 shadow-lg">
            <p className="text-sm text-muted-foreground">
              No profiles found for &quot;{query}&quot;
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Step 2: Claim ─────────────────────────────────────────────────────────────

function StepClaim({
  politician,
  onBack,
  onClaimed,
}: {
  politician: PoliticianResult;
  onBack: () => void;
  onClaimed: (politicianId: string) => void;
}) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function handleClaim() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/verify/claim", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ politician_id: politician.id }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Something went wrong. Please try again.");
          return;
        }
        onClaimed(politician.id);
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Claim this profile</h2>
      <p className="text-sm text-muted-foreground mb-6">
        Claiming your profile lets you respond to questions and sets your participation
        rate. You&apos;ll need to verify your identity with at least 2 methods to reach
        Verified ✓ status.
      </p>

      {/* Politician card */}
      <div className="rounded-xl border bg-card p-4 flex items-center gap-4 mb-6">
        <div className="shrink-0 flex h-12 w-12 items-center justify-center rounded-full border bg-muted text-sm font-bold text-muted-foreground overflow-hidden">
          {politician.photo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={politician.photo_url} alt={politician.full_name} className="h-full w-full object-cover" />
          ) : (
            politician.full_name.slice(0, 1).toUpperCase()
          )}
        </div>
        <div>
          <p className="font-semibold">{politician.full_name}</p>
          <p className="text-sm text-muted-foreground">
            {[politician.office, politician.state].filter(Boolean).join(" · ")}
            {politician.party && ` · ${politician.party}`}
          </p>
        </div>
      </div>

      <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30 px-4 py-3 mb-6">
        <p className="text-sm text-amber-800 dark:text-amber-300">
          ⚠️ By claiming this profile you confirm you are {politician.full_name} or
          an authorized representative with permission to act on their behalf.
          False claims may result in account removal.
        </p>
      </div>

      {error && <p className="text-sm text-destructive mb-4">{error}</p>}

      <div className="flex gap-3">
        <button
          type="button"
          onClick={onBack}
          disabled={isPending}
          className="flex-1 rounded-md border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors disabled:opacity-50"
        >
          ← Back
        </button>
        <button
          type="button"
          onClick={handleClaim}
          disabled={isPending}
          className="flex-1 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Claiming…" : "Claim this Profile"}
        </button>
      </div>
    </div>
  );
}

// ── Step 3: Verification Methods ──────────────────────────────────────────────

function GovEmailMethod({
  politicianId,
  onCompleted,
}: {
  politicianId: string;
  onCompleted: () => void;
}) {
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sentEmail, setSentEmail] = useState("");

  function handleRequest() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/verify/gov-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "request", politician_id: politicianId, email }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Failed to send code. Please try again.");
          return;
        }
        setSentEmail(email);
        setPhase("code");
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  function handleConfirm() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/verify/gov-email", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "confirm", politician_id: politicianId, code }),
        });
        const data = (await res.json()) as { error?: string };
        if (!res.ok) {
          setError(data.error ?? "Verification failed. Please try again.");
          return;
        }
        onCompleted();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  if (phase === "email") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Enter your official .gov email address. We&apos;ll send a verification code.
        </p>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="yourname@house.gov"
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          type="button"
          onClick={handleRequest}
          disabled={isPending || !email.endsWith(".gov")}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Sending…" : "Send Verification Code"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        We sent a 6-digit code to <span className="font-medium">{sentEmail}</span>.
        Enter it below.
      </p>
      <div className="flex gap-2">
        <input
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
          placeholder="000000"
          maxLength={6}
          className="w-32 rounded-md border bg-background px-3 py-2 text-sm font-mono text-center tracking-widest focus:outline-none focus:ring-2 focus:ring-ring"
        />
        <button
          type="button"
          onClick={handleConfirm}
          disabled={isPending || code.length !== 6}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Verifying…" : "Verify Code"}
        </button>
      </div>
      <button
        type="button"
        onClick={() => { setPhase("email"); setCode(""); setError(null); }}
        className="text-xs text-muted-foreground hover:text-foreground underline"
      >
        Wrong email? Go back
      </button>
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function MetaTagMethod({
  politicianId,
  onCompleted,
}: {
  politicianId: string;
  onCompleted: () => void;
}) {
  const [phase, setPhase] = useState<"generate" | "check">("generate");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/verify/meta-tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "generate", politician_id: politicianId }),
        });
        const data = (await res.json()) as { error?: string; code?: string; already_verified?: boolean };
        if (!res.ok) {
          setError(data.error ?? "Failed to generate code.");
          return;
        }
        if (data.already_verified) {
          onCompleted();
          return;
        }
        setCode(data.code ?? null);
        setPhase("check");
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  function handleCheck() {
    setError(null);
    startTransition(async () => {
      try {
        const res = await fetch("/api/verify/meta-tag", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "check", politician_id: politicianId }),
        });
        const data = (await res.json()) as { error?: string; message?: string; already_verified?: boolean };
        if (!res.ok) {
          setError(data.message ?? data.error ?? "Verification check failed.");
          return;
        }
        if (data.already_verified) {
          onCompleted();
          return;
        }
        onCompleted();
      } catch {
        setError("Network error. Please try again.");
      }
    });
  }

  function copyTag() {
    if (!code) return;
    const tag = `<meta name="whytho-verification" content="${code}">`;
    void navigator.clipboard.writeText(tag).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }

  if (phase === "generate") {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          We&apos;ll generate a unique code you add to your official website&apos;s{" "}
          <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;head&gt;</code>.
          This proves you control the domain.
        </p>
        {error && <p className="text-xs text-destructive">{error}</p>}
        <button
          type="button"
          onClick={handleGenerate}
          disabled={isPending}
          className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {isPending ? "Generating…" : "Generate Verification Code"}
        </button>
      </div>
    );
  }

  const tagHtml = code ? `<meta name="whytho-verification" content="${code}">` : "";

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Add this tag to your website&apos;s{" "}
        <code className="text-xs bg-muted px-1 py-0.5 rounded">&lt;head&gt;</code>,
        then click &quot;Check Verification&quot;.
      </p>
      <div className="rounded-md border bg-muted/50 p-3 flex items-start justify-between gap-2">
        <code className="text-xs break-all">{tagHtml}</code>
        <button
          type="button"
          onClick={copyTag}
          className="shrink-0 text-xs text-muted-foreground hover:text-foreground underline"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      {error && <p className="text-xs text-destructive">{error}</p>}
      <button
        type="button"
        onClick={handleCheck}
        disabled={isPending}
        className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
      >
        {isPending ? "Checking…" : "Check Verification"}
      </button>
      <p className="text-xs text-muted-foreground">
        It may take a minute for changes to propagate. If it fails, wait a moment and try
        again.
      </p>
    </div>
  );
}

function StepMethods({
  politicianId,
  onComplete,
}: {
  politicianId: string;
  onComplete: () => void;
}) {
  const [govEmailStatus, setGovEmailStatus] = useState<MethodStatus>("idle");
  const [metaTagStatus, setMetaTagStatus] = useState<MethodStatus>("idle");
  const [expandedMethod, setExpandedMethod] = useState<"gov_email" | "meta_tag" | null>(
    null
  );

  const completedCount = [govEmailStatus, metaTagStatus].filter((s) => s === "done")
    .length;

  // Auto-advance when 2 methods done
  useEffect(() => {
    if (completedCount < 2) return;
    const t = setTimeout(onComplete, 800);
    return () => clearTimeout(t);
  }, [completedCount, onComplete]);

  const methods = [
    {
      id: "gov_email" as const,
      title: "Government Email",
      description: "Verify using your official .gov email address",
      icon: "✉️",
      status: govEmailStatus,
      setStatus: setGovEmailStatus,
    },
    {
      id: "meta_tag" as const,
      title: "Website Meta Tag",
      description: "Add a verification tag to your official website",
      icon: "🌐",
      status: metaTagStatus,
      setStatus: setMetaTagStatus,
    },
  ];

  return (
    <div>
      <h2 className="text-xl font-semibold mb-1">Verify your identity</h2>
      <p className="text-sm text-muted-foreground mb-2">
        Complete <span className="font-medium">2 verification methods</span> to reach{" "}
        <span className="font-medium">Verified ✓</span> status (Tier 2).
      </p>
      <div className="flex items-center gap-2 mb-6">
        <div className="h-2 flex-1 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full rounded-full bg-green-500 transition-all duration-500"
            style={{ width: `${(completedCount / 2) * 100}%` }}
          />
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {completedCount}/2
        </span>
      </div>

      <div className="space-y-3">
        {methods.map((method) => (
          <div key={method.id} className="rounded-xl border bg-card overflow-hidden">
            {/* Method header */}
            <button
              type="button"
              onClick={() =>
                setExpandedMethod(
                  expandedMethod === method.id ? null : method.id
                )
              }
              disabled={method.status === "done"}
              className="w-full flex items-center gap-3 p-4 text-left hover:bg-muted/50 transition-colors disabled:cursor-default"
            >
              <span className="text-lg">{method.icon}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{method.title}</p>
                <p className="text-xs text-muted-foreground">{method.description}</p>
              </div>
              {method.status === "done" ? (
                <span className="text-xs font-medium text-green-600 dark:text-green-400 shrink-0">
                  ✓ Verified
                </span>
              ) : (
                <span className="text-xs text-muted-foreground shrink-0">
                  {expandedMethod === method.id ? "▲" : "▼"}
                </span>
              )}
            </button>

            {/* Expanded content */}
            {expandedMethod === method.id && method.status !== "done" && (
              <div className="border-t px-4 py-4 bg-muted/20">
                {method.id === "gov_email" ? (
                  <GovEmailMethod
                    politicianId={politicianId}
                    onCompleted={() => {
                      method.setStatus("done");
                      setExpandedMethod(null);
                    }}
                  />
                ) : (
                  <MetaTagMethod
                    politicianId={politicianId}
                    onCompleted={() => {
                      method.setStatus("done");
                      setExpandedMethod(null);
                    }}
                  />
                )}
              </div>
            )}
          </div>
        ))}
      </div>

      {completedCount > 0 && completedCount < 2 && (
        <p className="mt-4 text-sm text-muted-foreground text-center">
          {2 - completedCount} more method{completedCount === 1 ? "" : "s"} needed
        </p>
      )}

      {completedCount >= 2 && (
        <p className="mt-4 text-sm text-green-600 dark:text-green-400 font-medium text-center animate-pulse">
          ✓ All methods complete. Upgrading to Verified ✓…
        </p>
      )}
    </div>
  );
}

// ── Step 4: Done ──────────────────────────────────────────────────────────────

function StepDone({ politicianSlug }: { politicianSlug: string }) {
  return (
    <div className="text-center">
      <div className="text-5xl mb-4">🎉</div>
      <h2 className="text-2xl font-bold mb-2">You&apos;re Verified ✓</h2>
      <p className="text-muted-foreground mb-8 max-w-sm mx-auto">
        Your profile is now Verified ✓ (Tier 2). The public can see that this profile
        has been claimed and identity-verified. Head to your dashboard to start answering
        questions.
      </p>
      <div className="flex flex-col sm:flex-row gap-3 justify-center">
        <Link
          href="/dashboard"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Go to Dashboard →
        </Link>
        <Link
          href={`/${politicianSlug}`}
          className="inline-flex items-center justify-center rounded-md border px-6 py-2.5 text-sm font-medium hover:bg-muted transition-colors"
        >
          View your public profile
        </Link>
      </div>
    </div>
  );
}

// ── Main Wizard ───────────────────────────────────────────────────────────────

export function VerifyWizard({ prefillId }: { prefillId?: string }) {
  const { user, isLoading } = useUser();
  const [step, setStep] = useState<WizardStep>("find");
  const [selectedPolitician, setSelectedPolitician] =
    useState<PoliticianResult | null>(null);
  const [claimedPoliticianId, setClaimedPoliticianId] = useState<string | null>(null);

  // If prefillId is provided (from admin test-accounts page), fetch the politician
  // and jump directly to the claim step — bypassing the search.
  useEffect(() => {
    if (!prefillId || isLoading || !user || user.is_anonymous) return;
    fetch(`/api/politicians/prefill?id=${prefillId}`)
      .then((r) => r.json())
      .then((data: { politician?: PoliticianResult }) => {
        if (data.politician) {
          setSelectedPolitician(data.politician);
          setStep("claim");
        }
      })
      .catch(() => {/* fall through to normal find step */});
  }, [prefillId, isLoading, user]);

  // Map step → index (1-based) for the indicator
  const stepIndex: Record<WizardStep, number> = {
    find: 1,
    claim: 2,
    methods: 3,
    done: 4,
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4">
        <div className="h-8 w-48 rounded bg-muted" />
        <div className="h-12 rounded-lg bg-muted" />
      </div>
    );
  }

  if (!user || user.is_anonymous) {
    return (
      <div className="rounded-xl border bg-card p-8 text-center">
        <p className="text-lg font-semibold mb-2">Sign in to claim your profile</p>
        <p className="text-sm text-muted-foreground mb-6">
          You need an account to claim and verify a politician profile.
        </p>
        <Link
          href="/sign-in"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-2.5 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Sign in
        </Link>
      </div>
    );
  }

  return (
    <div className="rounded-xl border bg-card p-6 sm:p-8 shadow-sm">
      {step !== "done" && <StepIndicator current={stepIndex[step]} total={4} />}

      {step === "find" && (
        <StepFind
          onSelect={(politician) => {
            setSelectedPolitician(politician);
            setStep("claim");
          }}
        />
      )}

      {step === "claim" && selectedPolitician && (
        <StepClaim
          politician={selectedPolitician}
          onBack={() => { setStep("find"); setSelectedPolitician(null); }}
          onClaimed={(id) => {
            setClaimedPoliticianId(id);
            setStep("methods");
          }}
        />
      )}

      {step === "methods" && claimedPoliticianId && (
        <StepMethods
          politicianId={claimedPoliticianId}
          onComplete={() => setStep("done")}
        />
      )}

      {step === "done" && selectedPolitician && (
        <StepDone politicianSlug={selectedPolitician.slug} />
      )}
    </div>
  );
}
