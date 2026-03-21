import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About | WhyTho",
  description:
    "WhyTho is a civic accountability platform where the public asks questions of elected officials and silence is always visible.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12 space-y-10">

        <div className="space-y-3">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to home
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">About WhyTho</h1>
          <p className="text-lg text-muted-foreground">
            A civic accountability platform where silence is its own answer.
          </p>
        </div>

        <div className="prose prose-sm dark:prose-invert max-w-none space-y-6">

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">The Problem</h2>
            <p className="text-muted-foreground leading-relaxed">
              Elected officials are supposed to be accountable to the people who elected them.
              But in practice, constituents rarely get direct answers to direct questions, and
              when a politician dodges, changes the subject, or goes silent, there&apos;s no
              permanent record of that silence.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              WhyTho fixes that.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">What We Do</h2>
            <p className="text-muted-foreground leading-relaxed">
              We track every US elected official: federal representatives, senators, governors,
              and state legislators. Anyone can submit a question, and the community upvotes the
              ones that matter most. Questions that reach 10+ net votes become
              &ldquo;qualifying&rdquo;: ones that politicians are publicly expected to answer.
            </p>
            <p className="text-muted-foreground leading-relaxed">
              Every week, we record each politician&apos;s response rate: how many qualifying
              questions they answered vs. how many they ignored. That record is permanent. It
              follows them.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">The Weekly Cycle</h2>
            <p className="text-muted-foreground leading-relaxed">
              Every Monday at midnight Eastern, the week resets. Questions are archived, scores
              are locked in, and a fresh week begins. Politicians who answered their qualifying
              questions carry a strong response rate. Those who went silent carry that record too.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">For Politicians</h2>
            <p className="text-muted-foreground leading-relaxed">
              Any elected official can claim their profile and respond directly to questions from
              constituents. Verified officials get a checkmark and the ability to post answers
              in their own voice. Responding builds trust, and the platform surfaces that to
              constituents actively.
            </p>
            <Link
              href="/verify"
              className="inline-flex items-center text-sm font-medium text-foreground hover:underline"
            >
              Claim your profile →
            </Link>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold">Built by Quinnivations LLC</h2>
            <p className="text-muted-foreground leading-relaxed">
              WhyTho is an independent civic tech project. We have no affiliation with any
              political party, PAC, or government agency. We believe informed voters and
              accountable officials make democracy work better for everyone.
            </p>
          </section>

        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t">
          <Link
            href="/how-it-works"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            How It Works
          </Link>
          <Link
            href="/faq"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            FAQ
          </Link>
          <Link
            href="/leaderboard"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            View Leaderboard
          </Link>
        </div>

      </div>
    </main>
  );
}
