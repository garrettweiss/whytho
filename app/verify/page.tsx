import type { Metadata } from "next";
import { VerifyWizard } from "@/components/verify/verify-wizard";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/verify/verify.module.css";
import { createClient } from "@/lib/supabase/server";
import { buildVerificationResumes, type VerificationResume } from "@/components/verify/resume";

export const metadata: Metadata = {
  title: "Claim & Verify Your Profile | WhyTho",
  description:
    "Are you an elected official? Claim your WhyTho profile and verify your identity to start answering constituent questions.",
  robots: { index: false, follow: true },
};

interface Props {
  searchParams: Promise<{ prefill?: string | string[] }>;
}

export default async function VerifyPage({ searchParams }: Props) {
  const params = await searchParams;
  const prefill = typeof params.prefill === "string" && /^[0-9a-f-]{36}$/i.test(params.prefill) ? params.prefill : undefined;
  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  const resumeUserId = user && !user.is_anonymous ? user.id : null;
  let resumeProfiles: VerificationResume[] = [];
  let resumeError = !!authError && authError.name !== "AuthSessionMissingError";
  if (resumeUserId) {
    const signal = AbortSignal.timeout(8_000);
    const [memberships, verifications] = await Promise.all([
      supabase.from("politician_team")
        .select("user_id,role,politicians(id,slug,full_name,office,state,party,photo_url,verification_tier)", { count: "exact" })
        .eq("user_id", resumeUserId).order("politician_id").limit(1000).abortSignal(signal),
      supabase.from("politician_verifications")
        .select("user_id,politician_id,method,status", { count: "exact" })
        .eq("user_id", resumeUserId).eq("status", "completed").in("method", ["gov_email", "meta_tag"])
        .order("id").limit(1000).abortSignal(signal),
    ]);
    resumeError = !!memberships.error || !!verifications.error || !memberships.data || !verifications.data ||
      memberships.count !== memberships.data.length || verifications.count !== verifications.data.length;
    if (!resumeError) resumeProfiles = buildVerificationResumes(resumeUserId, memberships.data!, verifications.data!);
  }

  return <PublicPage title="Put your name behind the answer." kicker="For politicians and their teams" description="Claim your WhyTho profile and verify your identity. Then respond to the questions people want you to answer.">
    <div className={styles.layout}>
      <VerifyWizard key={resumeUserId ?? "signed-out"} prefillId={prefill} resumeUserId={resumeUserId} resumeProfiles={resumeProfiles} resumeError={resumeError} />
      <aside className={styles.guide} aria-labelledby="verification-guide">
        <h2 id="verification-guide">Make it official.</h2>
        <ol className={styles.guideSteps}>
          <li><span aria-hidden="true">01</span><div><h3>Find your profile</h3><p>Start with the public profile for you or the politician you represent.</p></div></li>
          <li><span aria-hidden="true">02</span><div><h3>Confirm your authority</h3><p>Claim only if you are the politician or have permission to act on their behalf.</p></div></li>
          <li><span aria-hidden="true">03</span><div><h3>Verify your identity</h3><p>Complete two verification methods to receive Verified status.</p></div></li>
        </ol>
        <p className={styles.support}>Need help with a claim? <a href="mailto:hello@whytho.us">Contact WhyTho</a></p>
      </aside>
    </div>
  </PublicPage>;
}
