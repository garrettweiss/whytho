import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "How It Works — WhyTho",
  description:
    "Learn how WhyTho's question cycle works — from submission to weekly reset to permanent response records.",
};

const steps = [
  {
    number: "01",
    title: "Find your representative",
    description:
      "Search by name, state, or office. Every US elected federal official and most state legislators have a profile. Profiles are auto-generated from public data — they exist whether or not the politician has joined.",
    detail:
      "We track 537 federal officials (535 Congress + President + VP), all 50 governors, and state legislators across 10 priority states — with more being added.",
  },
  {
    number: "02",
    title: "Submit or upvote a question",
    description:
      "Ask anything that's relevant to their public duties. Be specific and civil. The community votes on questions — upvoting the ones they also want answered.",
    detail:
      "Each week you can submit up to 5 questions and vote freely. Questions reset each week, but questions you've asked are always in the archive.",
  },
  {
    number: "03",
    title: "Questions qualify at 10+ votes",
    description:
      "When a question reaches 10 net upvotes, it becomes a \"qualifying question\" — one that the politician is publicly expected to answer before the week ends.",
    detail:
      "The qualifying threshold filters out noise. Only questions with real community support count toward a politician's response rate.",
  },
  {
    number: "04",
    title: "Politicians can respond",
    description:
      "Verified officials can log in and answer qualifying questions directly. Answers appear on their profile and are labeled as either a direct response or a team statement.",
    detail:
      "If a politician's staff finds a public statement or interview where the question was addressed, they can link it as a source. AI summaries of public record are also shown — clearly labeled as NOT a statement from the politician.",
  },
  {
    number: "05",
    title: "Monday reset — scores are locked in",
    description:
      "Every Monday at midnight Eastern, the week ends. The count of qualifying questions vs. answered questions is permanently recorded on each politician's profile.",
    detail:
      "Scores are immutable once locked. A politician cannot go back and answer archived questions to improve their historical rate.",
  },
  {
    number: "06",
    title: "Silence is always visible",
    description:
      "A politician's lifetime response rate is displayed on their profile — publicly, permanently. It rises when they engage and falls when they go silent.",
    detail:
      "This is the core mechanic: non-response is never hidden. Every week that passes without an answer is another week of silence on the record.",
  },
];

export default function HowItWorksPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12 space-y-10">

        <div className="space-y-3">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to home
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">How It Works</h1>
          <p className="text-lg text-muted-foreground">
            WhyTho runs on a simple weekly cycle. Here&apos;s the full picture.
          </p>
        </div>

        <div className="space-y-8">
          {steps.map((step) => (
            <div key={step.number} className="flex gap-5">
              <div className="shrink-0 pt-1">
                <span className="text-2xl font-bold text-muted-foreground/30 tabular-nums">
                  {step.number}
                </span>
              </div>
              <div className="space-y-2">
                <h2 className="text-lg font-semibold">{step.title}</h2>
                <p className="text-muted-foreground leading-relaxed">{step.description}</p>
                <p className="text-sm text-muted-foreground/70 leading-relaxed border-l-2 pl-3">
                  {step.detail}
                </p>
              </div>
            </div>
          ))}
        </div>

        {/* Verification tiers */}
        <div className="rounded-xl border bg-card p-6 space-y-4">
          <h2 className="text-lg font-semibold">Politician Verification Tiers</h2>
          <div className="space-y-3 text-sm">
            <div className="flex gap-3">
              <span className="shrink-0 font-mono text-muted-foreground w-8">T0</span>
              <div>
                <p className="font-medium">Unclaimed</p>
                <p className="text-muted-foreground">Auto-generated from public data. No one has claimed this profile yet.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 font-mono text-muted-foreground w-8">T1</span>
              <div>
                <p className="font-medium">Self-Claimed</p>
                <p className="text-muted-foreground">Someone has created an account and claimed this profile.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 font-mono text-muted-foreground w-8">T2</span>
              <div>
                <p className="font-medium">Verified ✓</p>
                <p className="text-muted-foreground">Identity confirmed via government email, FEC records, social verification, or Stripe Identity.</p>
              </div>
            </div>
            <div className="flex gap-3">
              <span className="shrink-0 font-mono text-muted-foreground w-8">T3</span>
              <div>
                <p className="font-medium">Fully Verified ✓✓</p>
                <p className="text-muted-foreground">Tier 2 + physical letter or vouching by a trusted official.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t">
          <Link
            href="/"
            className="rounded-lg bg-foreground text-background px-4 py-2 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Start asking questions
          </Link>
          <Link
            href="/faq"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            FAQ
          </Link>
          <Link
            href="/verify"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            Claim your profile
          </Link>
        </div>

      </div>
    </main>
  );
}
