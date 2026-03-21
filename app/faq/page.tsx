import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "FAQ | WhyTho",
  description: "Frequently asked questions about WhyTho's civic accountability platform.",
};

const faqs = [
  {
    category: "General",
    items: [
      {
        q: "Is WhyTho affiliated with any political party?",
        a: "No. WhyTho is an independent civic tech project run by Quinnivations LLC. We track all elected officials regardless of party and apply the same accountability standards to everyone.",
      },
      {
        q: "Are the politicians on here real?",
        a: "Yes. All profiles are generated from public government data sources: Congress.gov, OpenStates, and official state records. Politicians don't need to \"sign up\" to have a profile.",
      },
      {
        q: "What does \"silence is its own answer\" mean?",
        a: "It means that when a politician doesn't respond to qualifying questions, that non-response is recorded and displayed permanently. There's no neutral option; ignoring questions is a choice that shows on their public record.",
      },
    ],
  },
  {
    category: "Asking Questions",
    items: [
      {
        q: "Do I need to sign in to ask questions or vote?",
        a: "You need a free account (anonymous, Google, or email) to submit questions and vote. This prevents spam and ensures each person votes once. Reading profiles and questions is always open.",
      },
      {
        q: "How many questions can I ask per week?",
        a: "You can submit up to 5 questions per day total, and up to 3 questions per politician per 24-hour window. This keeps the platform focused on quality over quantity.",
      },
      {
        q: "What makes a question \"qualifying\"?",
        a: "A question becomes qualifying when it reaches 10+ net upvotes (upvotes minus downvotes). Only qualifying questions count toward a politician's response rate.",
      },
      {
        q: "What happens to my question at the weekly reset?",
        a: "Your question is archived. It won't appear on the politician's active feed anymore, but it's always accessible through their profile's question history. The week's response rate is locked in permanently.",
      },
      {
        q: "Can I ask about anything?",
        a: "Questions must relate to a politician's public duties, policies, or public statements. Personal attacks, harassment, and off-topic content are removed. We use both automated filters and human moderation.",
      },
    ],
  },
  {
    category: "Response Rates",
    items: [
      {
        q: "How is the response rate calculated?",
        a: "Response rate = (qualifying questions answered) / (total qualifying questions) × 100. Only questions with 10+ net votes count. If a politician has no qualifying questions in a week, that week doesn't affect their rate.",
      },
      {
        q: "Can a politician's historical response rate change?",
        a: "No. Once a week's scores are locked in at Monday reset, they're permanent. A politician cannot go back and answer archived questions to change their historical record.",
      },
      {
        q: "What if a politician answered the question somewhere else (a press conference, tweet, etc.)?",
        a: "Verified politicians and their teams can link public statements as answer sources. Alternatively, our AI analysis scans public record and may note if a related statement exists, but this is clearly labeled as AI analysis, not a direct answer.",
      },
    ],
  },
  {
    category: "For Politicians",
    items: [
      {
        q: "How do I claim my profile?",
        a: "Go to /verify, search for your name, and click \"Claim this profile.\" You'll need to create a free account first. After claiming (Tier 1), you can start the verification process to get the Verified checkmark.",
      },
      {
        q: "What verification methods are available?",
        a: "Government email address (.gov domain), FEC ID verification, social media code post, Stripe Identity (ID check), or website meta tag. Any two of these grant Tier 2 Verified status.",
      },
      {
        q: "Does participating in WhyTho endorse it?",
        a: "No. Claiming your profile and answering questions means you're engaging with your constituents. It doesn't imply endorsement of the platform or any political position.",
      },
      {
        q: "Can I dispute an AI-generated analysis?",
        a: "Yes. If an AI analysis of public record is inaccurate, verified politicians can flag it for review. Disputed content is marked with a ⚠️ warning until our team reviews it within 48 hours.",
      },
    ],
  },
  {
    category: "Moderation & Safety",
    items: [
      {
        q: "How do you handle abusive or off-topic questions?",
        a: "Questions are filtered for profanity automatically. Users can report questions. Questions that receive 3+ reports are automatically hidden pending review. Our moderation team reviews flagged content.",
      },
      {
        q: "Can I report a question?",
        a: "Yes, there's a report button on every question card. Select the reason (spam, offensive, off-topic, duplicate, or other) and we'll review it.",
      },
      {
        q: "What are the AI-generated questions I see?",
        a: "Some questions are pre-seeded by our system from public record to ensure each politician has at least a few relevant questions on their profile. These are always labeled \"💡 WhyTho suggested question\" and treated like any other question.",
      },
    ],
  },
];

export default function FaqPage() {
  return (
    <main className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12 space-y-10">

        <div className="space-y-3">
          <Link href="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">
            ← Back to home
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">FAQ</h1>
          <p className="text-lg text-muted-foreground">
            Frequently asked questions about WhyTho.
          </p>
        </div>

        <div className="space-y-10">
          {faqs.map((section) => (
            <div key={section.category} className="space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground border-b pb-2">
                {section.category}
              </h2>
              <div className="space-y-5">
                {section.items.map((item, i) => (
                  <div key={i} className="space-y-1.5">
                    <p className="font-medium text-sm">{item.q}</p>
                    <p className="text-sm text-muted-foreground leading-relaxed">{item.a}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div className="rounded-xl border bg-card p-5 space-y-2">
          <p className="text-sm font-medium">Still have questions?</p>
          <p className="text-sm text-muted-foreground">
            We&apos;re a small team building this in public. Reach out via{" "}
            <a
              href="mailto:support@whytho.us"
              className="underline hover:text-foreground transition-colors"
            >
              support@whytho.us
            </a>
            .
          </p>
        </div>

        <div className="flex flex-wrap gap-3 pt-4 border-t">
          <Link
            href="/how-it-works"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            How It Works
          </Link>
          <Link
            href="/about"
            className="rounded-lg border px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
          >
            About WhyTho
          </Link>
        </div>

      </div>
    </main>
  );
}
