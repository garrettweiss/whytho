"use client";

import { useState, useEffect, useRef, useTransition, type FormEvent } from "react";
import Link from "next/link";
import { useUser } from "@/lib/auth/use-user";
import styles from "./verify.module.css";
import { initialVerificationResume, type VerificationMethod, type VerificationPolitician, type VerificationResume } from "./resume";

type PoliticianResult = VerificationPolitician;
type WizardStep = "find" | "claim" | "methods" | "done";
type MethodId = VerificationMethod;

function Portrait({ politician }: { politician: PoliticianResult }) {
  const [failed, setFailed] = useState(false);
  const safePhoto = politician.photo_url?.startsWith("https://") ? politician.photo_url : null;
  return <span className={styles.portrait} aria-hidden="true">
    {/* Native images keep civic portraits out of the server image proxy. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {safePhoto && !failed ? <img src={safePhoto} alt="" width={80} height={100} referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : politician.full_name.slice(0, 1).toUpperCase()}
  </span>;
}

function StepIndicator({ current }: { current: number }) {
  return <ol className={styles.steps} aria-label="Profile verification steps">
    {["Find", "Claim", "Verify", "Complete"].map((label, index) => <li key={label} aria-current={index + 1 === current ? "step" : undefined} className={index + 1 < current ? styles.completedStep : undefined}>
      <span className={styles.stepNumber} aria-hidden="true">{index + 1 < current ? "✓" : `0${index + 1}`}</span><span>{label}{index + 1 < current && <span className="sr-only">, completed</span>}</span>
    </li>)}
  </ol>;
}

function StepFind({ onSelect }: { onSelect: (politician: PoliticianResult) => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<PoliticianResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [searchError, setSearchError] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const [showRequestForm, setShowRequestForm] = useState(false);
  const [reqName, setReqName] = useState("");
  const [reqOffice, setReqOffice] = useState("");
  const [reqState, setReqState] = useState("");
  const [reqEmail, setReqEmail] = useState("");
  const [reqSubmitted, setReqSubmitted] = useState(false);
  const [reqError, setReqError] = useState<string | null>(null);
  const [reqPending, startReqTransition] = useTransition();
  const requestNameRef = useRef<HTMLInputElement>(null);
  const requestSuccessRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    const controller = new AbortController();
    setResults([]); setIsOpen(false); setSearchError("");
    if (query.trim().length < 2) { setIsLoading(false); return; }
    setIsLoading(true);
    const timer = setTimeout(async () => {
      try {
        const response = await fetch(`/api/politicians/search?q=${encodeURIComponent(query.trim())}`, { signal: controller.signal });
        if (!response.ok) throw new Error("Search unavailable");
        const data = (await response.json()) as { politicians?: PoliticianResult[] };
        if (!Array.isArray(data.politicians)) throw new Error("Search unavailable");
        if (!controller.signal.aborted) { setResults(data.politicians); setIsOpen(true); }
      } catch {
        if (!controller.signal.aborted) setSearchError("We couldn’t load profiles. Change your search or try again.");
      } finally {
        if (!controller.signal.aborted) setIsLoading(false);
      }
    }, 300);
    return () => { clearTimeout(timer); controller.abort(); };
  }, [query]);
  useEffect(() => { if (showRequestForm) requestNameRef.current?.focus(); }, [showRequestForm]);
  useEffect(() => { if (reqSubmitted) requestSuccessRef.current?.focus(); }, [reqSubmitted]);

  function handleRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (reqPending) return;
    setReqError(null);
    startReqTransition(async () => {
      try {
        const response = await fetch("/api/verify/request-profile", {
          method: "POST", headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: reqName.trim(), office: reqOffice.trim(), state: reqState.trim(), email: reqEmail.trim() }),
        });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) { setReqError(data.error ?? "We couldn’t submit your request. Please try again."); return; }
        setReqSubmitted(true);
      } catch { setReqError("We couldn’t confirm your request. Contact WhyTho if you’re unsure whether it was received."); }
    });
  }

  return <div>
    <h2 className={styles.stepTitle} tabIndex={-1} data-step-heading>Find your profile.</h2>
    <p className={styles.intro}>Search for the politician you represent. Check the name and office before you continue.</p>
    <label className={styles.field} htmlFor="claim-search"><span className={styles.label}>Politician’s name</span>
      <span className={styles.search}><input ref={searchRef} id="claim-search" className={`${styles.input} ${styles.searchInput}`} type="search" maxLength={100} autoComplete="off" value={query} onChange={event => setQuery(event.target.value)} onFocus={() => results.length > 0 && setIsOpen(true)} onKeyDown={event => { if (event.key === "Escape") setIsOpen(false); }} placeholder="Search by name" aria-describedby="claim-search-status" /><span className={styles.searchIcon} aria-hidden="true">↗</span></span>
    </label>
    <p id="claim-search-status" className={searchError ? styles.error : styles.searchStatus} role="status">{searchError || (isLoading ? "Searching profiles…" : isOpen ? `${results.length} matching profile${results.length === 1 ? "" : "s"}. Choose yours to continue.` : "Enter at least two characters.")}</p>
    {isOpen && results.length > 0 && <ul className={styles.results} aria-label="Matching politician profiles">{results.map(politician => <li key={politician.id}>
      <button type="button" className={styles.result} onClick={() => { setIsOpen(false); onSelect(politician); }}>
        <Portrait politician={politician} /><span className={styles.resultCopy}><span className={styles.resultName}>{politician.full_name}</span><span className={styles.resultMeta}>{[politician.office, politician.state, politician.party].filter(Boolean).join(" · ")}</span></span><span aria-hidden="true">→</span>
      </button>
    </li>)}</ul>}
    {!showRequestForm && !reqSubmitted && <button type="button" className={styles.textButton} onClick={() => { setIsOpen(false); setReqName(query); setShowRequestForm(true); }}>Can’t find your profile? Request one →</button>}
    {showRequestForm && !reqSubmitted && <form className={styles.requestForm} onSubmit={handleRequestSubmit} aria-labelledby="request-profile-title" aria-busy={reqPending}>
      <h3 id="request-profile-title" className={styles.requestTitle}>Request your profile</h3>
      <p className={styles.hint}>Share the details below so the WhyTho team can review your request.</p>
      <div className={styles.requestFields}>
        <label className={`${styles.field} ${styles.requestFull}`} htmlFor="req-name"><span className={styles.label}>Full name</span><input ref={requestNameRef} id="req-name" className={styles.input} autoComplete="name" value={reqName} onChange={event => setReqName(event.target.value)} required maxLength={200} disabled={reqPending} /></label>
        <label className={styles.field} htmlFor="req-office"><span className={styles.label}>Office or title</span><input id="req-office" className={styles.input} placeholder="State Senator" value={reqOffice} onChange={event => setReqOffice(event.target.value)} maxLength={200} disabled={reqPending} /></label>
        <label className={styles.field} htmlFor="req-state"><span className={styles.label}>State</span><input id="req-state" className={styles.input} autoComplete="address-level1" placeholder="Colorado" value={reqState} onChange={event => setReqState(event.target.value)} maxLength={200} disabled={reqPending} /></label>
        <label className={`${styles.field} ${styles.requestFull}`} htmlFor="req-email"><span className={styles.label}>Contact email</span><input id="req-email" className={styles.input} type="email" autoComplete="email" placeholder="you@example.gov" value={reqEmail} onChange={event => setReqEmail(event.target.value)} required maxLength={254} disabled={reqPending} /></label>
      </div>
      {reqError && <p role="alert" className={styles.error}>{reqError}</p>}
      <div className={styles.actions}><button type="submit" className={styles.primary} disabled={reqPending || !reqName.trim() || !reqEmail.trim()}>{reqPending ? "Submitting…" : "Submit request"}</button><button type="button" className={styles.secondary} disabled={reqPending} onClick={() => { setShowRequestForm(false); requestAnimationFrame(() => searchRef.current?.focus()); }}>Cancel</button></div>
    </form>}
    {reqSubmitted && <section className={styles.notice}><h3 ref={requestSuccessRef} tabIndex={-1} className={styles.requestTitle}>Request submitted.</h3><p className={styles.hint}>The WhyTho team will review the details you provided. Your contact email is {reqEmail}.</p></section>}
  </div>;
}

function StepClaim({ politician, onBack, onClaimed }: { politician: PoliticianResult; onBack: () => void; onClaimed: (id: string) => void }) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  function handleClaim() {
    if (isPending) return;
    setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/verify/claim", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ politician_id: politician.id }) });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) { setError(data.error ?? "We couldn’t claim this profile. Please try again."); return; }
        onClaimed(politician.id);
      } catch { setError("We couldn’t confirm the claim. Check your dashboard before trying again."); }
    });
  }
  return <div aria-busy={isPending}>
    <h2 className={styles.stepTitle} tabIndex={-1} data-step-heading>Is this your profile?</h2>
    <p className={styles.intro}>Claim it to manage official responses. Complete two identity checks to receive Verified status.</p>
    <div className={styles.selected}><Portrait politician={politician} /><div className={styles.resultCopy}><p className={styles.resultName}>{politician.full_name}</p><p className={styles.resultMeta}>{[politician.office, politician.state, politician.party].filter(Boolean).join(" · ")}</p></div></div>
    <p className={styles.notice}>By claiming this profile, you confirm you are {politician.full_name} or an authorized representative with permission to act on their behalf. False claims may result in account removal.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div className={styles.actions}><button type="button" className={styles.secondary} onClick={onBack} disabled={isPending}>← Choose another profile</button><button type="button" className={styles.primary} onClick={handleClaim} disabled={isPending}>{isPending ? "Claiming…" : "Claim this profile"}</button></div>
  </div>;
}

function GovEmailMethod({ politicianId, onCompleted }: { politicianId: string; onCompleted: () => void }) {
  const [phase, setPhase] = useState<"email" | "code">("email");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [sentEmail, setSentEmail] = useState("");
  const emailRef = useRef<HTMLInputElement>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const previousPhase = useRef(phase);
  useEffect(() => { if (!isPending && phase !== previousPhase.current) { (phase === "code" ? codeRef : emailRef).current?.focus(); previousPhase.current = phase; } }, [phase, isPending]);

  function handleRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (isPending) return; setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/verify/gov-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "request", politician_id: politicianId, email }) });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) { setError(data.error ?? "We couldn’t send a code. Please try again."); return; }
        setSentEmail(email); setPhase("code");
      } catch { setError("We couldn’t confirm that a code was sent. Check your inbox before trying again."); }
    });
  }
  function handleConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (isPending) return; setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/verify/gov-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "confirm", politician_id: politicianId, code }) });
        const data = (await response.json()) as { error?: string };
        if (!response.ok) { setError(data.error ?? "The code could not be verified. Please try again."); return; }
        onCompleted();
      } catch { setError("We couldn’t confirm verification. Please try again."); }
    });
  }
  if (phase === "email") return <form className={styles.stack} onSubmit={handleRequest} aria-label="Verify government email" aria-busy={isPending}>
    <p className={styles.hint}>Use your official .gov email address. We’ll send a six-digit verification code.</p>
    <label className={styles.field} htmlFor="gov-email"><span className={styles.label}>Government email</span><input ref={emailRef} id="gov-email" className={styles.input} type="email" autoComplete="email" value={email} onChange={event => setEmail(event.target.value)} placeholder="yourname@house.gov" required disabled={isPending} aria-describedby={error ? "gov-email-error" : undefined} /></label>
    {error && <p id="gov-email-error" role="alert" className={styles.error}>{error}</p>}
    <div><button type="submit" className={styles.primary} disabled={isPending || !email.endsWith(".gov")}>{isPending ? "Sending…" : "Send verification code"}</button></div>
  </form>;
  return <form className={styles.stack} onSubmit={handleConfirm} aria-label="Confirm government email code" aria-busy={isPending}>
    <p className={styles.hint}>We sent a six-digit code to <strong>{sentEmail}</strong>. Enter it below.</p>
    <div className={styles.codeRow}><label className={styles.field} htmlFor="gov-code"><span className={styles.label}>Verification code</span><input ref={codeRef} id="gov-code" className={`${styles.input} ${styles.codeInput}`} type="text" inputMode="numeric" autoComplete="one-time-code" value={code} onChange={event => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="000000" maxLength={6} pattern="[0-9]{6}" required disabled={isPending} aria-describedby={error ? "gov-code-error" : undefined} /></label><button type="submit" className={styles.primary} disabled={isPending || code.length !== 6}>{isPending ? "Verifying…" : "Verify code"}</button></div>
    {error && <p id="gov-code-error" role="alert" className={styles.error}>{error}</p>}
    <button type="button" className={styles.textButton} disabled={isPending} onClick={() => { setPhase("email"); setCode(""); setError(null); }}>Use a different email</button>
  </form>;
}

function MetaTagMethod({ politicianId, onCompleted }: { politicianId: string; onCompleted: () => void }) {
  const [phase, setPhase] = useState<"generate" | "check">("generate");
  const [code, setCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const instructionsRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (phase === "check") instructionsRef.current?.focus(); }, [phase]);

  function handleGenerate() {
    if (isPending) return; setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/verify/meta-tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "generate", politician_id: politicianId }) });
        const data = (await response.json()) as { error?: string; code?: string; already_verified?: boolean };
        if (!response.ok) { setError(data.error ?? "We couldn’t generate a code. Please try again."); return; }
        if (data.already_verified) { onCompleted(); return; }
        if (!data.code) { setError("No verification code was returned. Please try again."); return; }
        setCode(data.code); setPhase("check");
      } catch { setError("We couldn’t generate a code. Please try again."); }
    });
  }
  function handleCheck() {
    if (isPending) return; setError(null);
    startTransition(async () => {
      try {
        const response = await fetch("/api/verify/meta-tag", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "check", politician_id: politicianId }) });
        const data = (await response.json()) as { error?: string; message?: string; already_verified?: boolean };
        if (!response.ok) { setError(data.message ?? data.error ?? "The verification check could not be completed."); return; }
        onCompleted();
      } catch { setError("We couldn’t confirm verification. Please try again."); }
    });
  }
  async function copyTag() {
    if (!code) return;
    try { await navigator.clipboard.writeText(`<meta name="whytho-verification" content="${code}">`); setCopied(true); }
    catch { setError("Copy is unavailable. Select and copy the tag shown here."); }
  }
  if (phase === "generate") return <div className={styles.stack} aria-busy={isPending}>
    <p className={styles.hint}>Add a verification tag to your official website’s <code className={styles.inlineCode}>&lt;head&gt;</code>. This confirms you can update that website.</p>
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div><button type="button" className={styles.primary} onClick={handleGenerate} disabled={isPending}>{isPending ? "Generating…" : "Generate verification tag"}</button></div>
  </div>;
  return <div className={styles.stack} aria-busy={isPending}>
    <p ref={instructionsRef} tabIndex={-1} className={styles.hint}>Add this tag to your website’s <code className={styles.inlineCode}>&lt;head&gt;</code>, then select Check verification.</p>
    <div className={styles.codeBlock}><code>{code ? `<meta name="whytho-verification" content="${code}">` : ""}</code><button type="button" className={`${styles.textButton} ${styles.copyButton}`} onClick={() => void copyTag()}>{copied ? "Copied" : "Copy"}</button></div>
    {copied && <p role="status" className={styles.success}>Verification tag copied.</p>}
    {error && <p role="alert" className={styles.error}>{error}</p>}
    <div><button type="button" className={styles.primary} onClick={handleCheck} disabled={isPending}>{isPending ? "Checking…" : "Check verification"}</button></div>
    <p className={styles.hint}>Website changes can take a moment to appear. If the tag is not found, wait and check again.</p>
  </div>;
}

function StepMethods({ politicianId, politicianName, initialMethods, onComplete }: { politicianId: string; politicianName: string; initialMethods: MethodId[]; onComplete: () => void }) {
  const [completed, setCompleted] = useState<MethodId[]>(initialMethods);
  const [expanded, setExpanded] = useState<MethodId | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const completedCount = completed.length;
  useEffect(() => {
    if (completedCount < 2) return;
    const timer = setTimeout(onComplete, 800);
    return () => clearTimeout(timer);
  }, [completedCount, onComplete]);
  function completeMethod(id: MethodId) {
    setCompleted(previous => previous.includes(id) ? previous : [...previous, id]); setExpanded(null);
    requestAnimationFrame(() => progressRef.current?.focus());
  }
  const methods: { id: MethodId; title: string; description: string }[] = [
    { id: "gov_email", title: "Government email", description: "Use your official .gov email address." },
    { id: "meta_tag", title: "Official website", description: "Add a verification tag to the website you control." },
  ];
  return <div>
    <h2 className={styles.stepTitle} tabIndex={-1} data-step-heading>Make your identity clear.</h2>
    <p className={styles.intro}>Continue verification for <strong>{politicianName}</strong>. Completed checks are saved to your account. Complete both methods below to receive Verified status.</p>
    <div ref={progressRef} tabIndex={-1} className={styles.progress} role="status"><span>{completedCount} of 2 methods complete{completedCount === 2 ? ". Opening your confirmation…" : "."}</span><div className={styles.progressTrack} aria-hidden="true"><div className={styles.progressFill} style={{ width: `${completedCount * 50}%` }} /></div></div>
    <div className={styles.methods}>{methods.map(method => {
      const done = completed.includes(method.id); const open = expanded === method.id && !done;
      return <section key={method.id} className={styles.method}>
        <button type="button" className={styles.methodToggle} disabled={done} aria-expanded={open} aria-controls={open ? `method-${method.id}` : undefined} onClick={() => setExpanded(open ? null : method.id)}>
          <span className={styles.methodCopy}><span className={styles.methodName}>{method.title}</span><span className={styles.methodDescription}>{method.description}</span></span><span className={done ? styles.methodDone : undefined}>{done ? "✓ Verified" : <span aria-hidden="true">{open ? "−" : "+"}</span>}</span>
        </button>
        {open && <div id={`method-${method.id}`} className={styles.methodBody}>{method.id === "gov_email" ? <GovEmailMethod politicianId={politicianId} onCompleted={() => completeMethod(method.id)} /> : <MetaTagMethod politicianId={politicianId} onCompleted={() => completeMethod(method.id)} />}</div>}
      </section>;
    })}</div>
  </div>;
}

function StepDone({ politicianSlug, verified }: { politicianSlug: string; verified: boolean }) {
  return <div>
    <h2 className={styles.completion} tabIndex={-1} data-step-heading>{verified ? "Your profile is verified." : "Identity checks complete."}</h2>
    <p className={styles.intro}>{verified ? "This profile already has Verified status. You can manage responses in your dashboard." : "Both identity checks are complete. Your public profile shows the recorded verification status. Open your dashboard to start answering questions."}</p>
    <div className={styles.actions}><Link href="/dashboard" className={styles.primary}>Go to dashboard →</Link><Link href={`/${politicianSlug}`} className={styles.secondary}>View public profile</Link></div>
  </div>;
}

export function VerifyWizard({ prefillId, resumeUserId, resumeProfiles, resumeError = false }: { prefillId?: string; resumeUserId: string | null; resumeProfiles: VerificationResume[]; resumeError?: boolean }) {
  const { user, isLoading } = useUser();
  const initialResume = initialVerificationResume(resumeProfiles, prefillId);
  const [step, setStep] = useState<WizardStep>(initialResume ? initialResume.verified ? "done" : "methods" : "find");
  const [selectedPolitician, setSelectedPolitician] = useState<PoliticianResult | null>(initialResume?.politician ?? null);
  const [claimedPoliticianId, setClaimedPoliticianId] = useState<string | null>(initialResume?.politician.id ?? null);
  const [completedMethods, setCompletedMethods] = useState<MethodId[]>(initialResume?.completedMethods ?? []);
  const [verified, setVerified] = useState(initialResume?.verified ?? false);
  const wizardRef = useRef<HTMLElement>(null);
  const previousStep = useRef(step);
  const prefillApplied = useRef(false);
  const returnPath = prefillId ? `/verify?prefill=${encodeURIComponent(prefillId)}` : "/verify";

  // The existing prefill endpoint keeps its admin authorization checks.
  useEffect(() => {
    if (!prefillId || prefillApplied.current || initialResume || resumeError || isLoading || !user || user.is_anonymous || user.id !== resumeUserId) return;
    const controller = new AbortController();
    void fetch(`/api/politicians/prefill?id=${encodeURIComponent(prefillId)}`, { signal: controller.signal })
      .then(async response => response.ok ? await response.json() as { politician?: PoliticianResult } : null)
      .then(data => { if (!controller.signal.aborted && data?.politician) { prefillApplied.current = true; setSelectedPolitician(data.politician); setStep("claim"); } })
      .catch(() => { /* Normal search remains available when prefill cannot be read. */ });
    return () => controller.abort();
  }, [prefillId, isLoading, user, initialResume, resumeUserId, resumeError]);
  useEffect(() => {
    if (step !== previousStep.current) {
      wizardRef.current?.querySelector<HTMLElement>("[data-step-heading]")?.focus();
      previousStep.current = step;
    }
  }, [step]);

  if (isLoading) return <section className={styles.wizard} aria-label="Claim a profile" aria-busy="true"><p className={styles.loading} role="status">Loading your account…</p><div className={styles.loadingRule} aria-hidden="true" /></section>;
  if (!user || user.is_anonymous) return <section className={styles.wizard} aria-labelledby="claim-sign-in">
    <h2 id="claim-sign-in" className={styles.stepTitle}>Your voice. Your profile.</h2><p className={styles.intro}>Sign in to claim and verify a politician profile. You must be the politician or an authorized representative.</p>
    <Link href={`/sign-in?redirect=${encodeURIComponent(returnPath)}`} className={styles.primary}>Sign in to get started <span aria-hidden="true">↗</span></Link>
  </section>;
  if (resumeError || user.id !== resumeUserId) return <section className={styles.wizard} aria-labelledby="resume-unavailable">
    <h2 id="resume-unavailable" className={styles.stepTitle}>Your verification details couldn’t load.</h2>
    <p role="alert" className={styles.intro}>We could not confirm your existing claims and completed checks. Reload this page before starting or continuing verification.</p>
    <button type="button" className={styles.primary} onClick={() => window.location.reload()}>Reload verification</button>
  </section>;
  function continueProfile(profile: VerificationResume) {
    setSelectedPolitician(profile.politician);
    setClaimedPoliticianId(profile.politician.id);
    setCompletedMethods(profile.completedMethods);
    setVerified(profile.verified);
    setStep(profile.verified ? "done" : "methods");
  }
  function selectProfile(politician: PoliticianResult) {
    const existing = resumeProfiles.find(profile => profile.politician.id === politician.id);
    if (existing) { continueProfile(existing); return; }
    setSelectedPolitician(politician); setCompletedMethods([]); setVerified(false); setStep("claim");
  }
  const stepIndex: Record<WizardStep, number> = { find: 1, claim: 2, methods: 3, done: 4 };
  return <section ref={wizardRef} className={styles.wizard} aria-label="Claim and verify your profile">
    <StepIndicator current={stepIndex[step]} />
    {step === "find" && <>
      {resumeProfiles.length > 0 && <section aria-labelledby="resume-verification-title">
        <h2 id="resume-verification-title" className={styles.stepTitle}>Continue where you left off.</h2>
        <p className={styles.intro}>These are profiles you already help manage. Continue verification without claiming again.</p>
        <ul className={styles.results}>{resumeProfiles.map(profile => <li key={profile.politician.id}>
          <button type="button" className={styles.result} onClick={() => continueProfile(profile)}>
            <Portrait politician={profile.politician} /><span className={styles.resultCopy}><span className={styles.resultName}>{profile.politician.full_name}</span><span className={styles.resultMeta}>{profile.role} access · {profile.verified ? "Profile verified" : `${profile.completedMethods.length} of 2 checks complete`}</span><span className={styles.resultMeta}>{profile.verified ? "View verification status" : "Continue verification"}</span></span><span aria-hidden="true">→</span>
          </button>
        </li>)}</ul>
      </section>}
      <StepFind onSelect={selectProfile} />
    </>}
    {step === "claim" && selectedPolitician && <StepClaim politician={selectedPolitician} onBack={() => { setStep("find"); setSelectedPolitician(null); }} onClaimed={id => { setClaimedPoliticianId(id); setStep("methods"); }} />}
    {step === "methods" && claimedPoliticianId && selectedPolitician && <StepMethods key={claimedPoliticianId} politicianId={claimedPoliticianId} politicianName={selectedPolitician.full_name} initialMethods={completedMethods} onComplete={() => setStep("done")} />}
    {step === "done" && selectedPolitician && <StepDone politicianSlug={selectedPolitician.slug} verified={verified} />}
  </section>;
}
