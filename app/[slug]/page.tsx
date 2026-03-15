import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { PoliticianHeader } from "@/components/politician/politician-header";
import { ParticipationRate } from "@/components/politician/participation-rate";
import { QuestionList } from "@/components/politician/question-list";
import { AskQuestionForm } from "@/components/questions/ask-question-form";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: politician } = await supabase
    .from("politicians")
    .select("full_name, office, state, party, photo_url, bio")
    .eq("slug", slug)
    .single();

  if (!politician) return { title: "Politician Not Found — WhyTho" };

  const title = `${politician.full_name} — WhyTho`;
  const description = `Ask ${politician.full_name} (${politician.office}) a question. See their response rate and track whether they answer. Silence is its own answer.`;

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      images: politician.photo_url ? [politician.photo_url] : [],
      type: "profile",
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: politician.photo_url ? [politician.photo_url] : [],
    },
  };
}

export default async function PoliticianProfilePage({ params }: Props) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: politician } = await supabase
    .from("politicians")
    .select("*")
    .eq("slug", slug)
    .single();

  if (!politician) notFound();

  // Current week number
  const { data: weekData } = await supabase
    .rpc("current_week_number");
  const weekNumber = weekData as number;

  // Current week questions
  const { data: questions } = await supabase
    .from("questions")
    .select(`
      id,
      body,
      net_upvotes,
      is_seeded,
      status,
      submitted_by,
      created_at,
      week_number,
      answers (
        id,
        answer_type,
        body,
        is_ai_generated,
        ai_confidence,
        sources,
        is_disputed,
        created_at
      )
    `)
    .eq("politician_id", politician.id)
    .eq("week_number", weekNumber)
    .eq("status", "active")
    .order("net_upvotes", { ascending: false })
    .limit(50);

  // Participation rate for current week
  const { data: participationRate } = await supabase
    .rpc("participation_rate", {
      p_politician_id: politician.id,
      p_week_number: weekNumber,
    });

  // Recent weekly snapshots (last 8 weeks for sparkline)
  const { data: snapshots } = await supabase
    .from("weekly_snapshots")
    .select("week_number, participation_rate, answered_qualifying, qualifying_questions")
    .eq("politician_id", politician.id)
    .order("week_number", { ascending: false })
    .limit(8);

  const BASE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? "https://whytho-alpha.vercel.app";
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Person",
    name: politician.full_name,
    jobTitle: politician.office ?? undefined,
    url: `${BASE_URL}/${politician.slug}`,
    image: politician.photo_url ?? undefined,
    description: politician.bio ?? undefined,
    sameAs: (() => {
      const handles = (politician.social_handles ?? {}) as Record<string, string>;
      return [
        handles.twitter ? `https://twitter.com/${handles.twitter}` : null,
        politician.website_url ?? null,
      ].filter(Boolean);
    })(),
  };

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <div className="min-h-screen bg-background">
        <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
          <PoliticianHeader
            politician={politician}
            currentParticipationRate={participationRate as number | null}
          />

          <ParticipationRate
            currentRate={participationRate as number | null}
            snapshots={snapshots ?? []}
            weekNumber={weekNumber}
          />

          <AskQuestionForm
            politicianId={politician.id}
            politicianName={politician.full_name}
          />

          <QuestionList
            questions={questions ?? []}
            politicianId={politician.id}
            weekNumber={weekNumber}
          />
        </div>
      </div>
    </>
  );
}

// Static generation for top politicians — rest are dynamic
export async function generateStaticParams() {
  const { createAdminClient } = await import("@/lib/supabase/server");
  const supabase = createAdminClient();

  const { data } = await supabase
    .from("politicians")
    .select("slug")
    .eq("is_active", true)
    .limit(1000);

  return (data ?? []).map((p) => ({ slug: p.slug }));
}
