import type { Metadata } from "next";
import { VerifyWizard } from "@/components/verify/verify-wizard";

export const metadata: Metadata = {
  title: "Claim & Verify Your Profile | WhyTho",
  description:
    "Are you an elected official? Claim your WhyTho profile and verify your identity to start answering constituent questions.",
};

interface Props {
  searchParams: Promise<{ prefill?: string }>;
}

export default async function VerifyPage({ searchParams }: Props) {
  const { prefill } = await searchParams;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-2xl px-4 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold tracking-tight mb-3">
            Claim Your Profile
          </h1>
          <p className="text-muted-foreground max-w-md mx-auto">
            Are you an elected official or their authorized representative? Claim your
            profile and verify your identity to respond to constituent questions.
          </p>
        </div>

        {/* How it works */}
        <div className="grid grid-cols-3 gap-4 mb-10 text-center">
          {[
            { icon: "🔍", label: "Find", desc: "Search for your profile" },
            { icon: "🏛️", label: "Claim", desc: "Claim as your own" },
            { icon: "✓", label: "Verify", desc: "Prove your identity" },
          ].map((s) => (
            <div key={s.label} className="space-y-1">
              <div className="text-2xl">{s.icon}</div>
              <p className="text-sm font-semibold">{s.label}</p>
              <p className="text-xs text-muted-foreground">{s.desc}</p>
            </div>
          ))}
        </div>

        {/* Wizard */}
        <VerifyWizard prefillId={prefill} />

        {/* Footer note */}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          All profile claims are reviewed for accuracy. Questions?{" "}
          <a
            href="mailto:hello@whytho.us"
            className="underline hover:text-foreground transition-colors"
          >
            Contact us
          </a>
        </p>
      </div>
    </div>
  );
}
