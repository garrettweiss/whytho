import type { Metadata } from "next";
import Link from "next/link";
import { SignInForm } from "@/components/auth/sign-in-form";
import { safeReturnPath } from "@/components/auth/safe-return-path";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/account/account.module.css";

export const metadata: Metadata = { title: "Sign In | WhyTho", robots: { index: false, follow: true } };
interface Props { searchParams: Promise<{ redirect?: string | string[]; error?: string | string[] }> }

export default async function SignInPage({ searchParams }: Props) {
  const { redirect, error } = await searchParams;
  const redirectAfter = safeReturnPath(redirect);
  const isPoliticianContext = redirectAfter.startsWith("/verify") || redirectAfter.startsWith("/dashboard");
  const callbackFailed = error === "auth_callback_failed" || error === "google_auth_failed";

  return <PublicPage title={isPoliticianContext ? "Step up. Answer." : "Your voice. On record."} kicker="Sign in to WhyTho"
    description={isPoliticianContext ? "Sign in to claim your profile and respond to the questions people are asking." : "Ask questions directly, support the ones that matter to you, and return to your history."}>
    <div className={styles.signInLayout}>
      <div>{callbackFailed && <p role="alert" className={styles.error}>That sign-in could not be completed. Please request a new link or try Google again.</p>}<SignInForm redirectAfter={redirectAfter} /></div>
      <aside className={styles.signInAside} aria-labelledby="sign-in-context">
        <h2 id="sign-in-context">{isPoliticianContext ? "The questions are public." : "Start with a question."}</h2>
        <p>{isPoliticianContext ? "Your team can use a claimed profile to publish responses. Signing in is the first step; profile verification is a separate process." : "You can vote on questions without creating an account. Sign in when you are ready to ask your own questions and keep track of your activity."}</p>
        <Link href="/how-it-works">How WhyTho works <span aria-hidden="true"> ↗</span></Link>
      </aside>
    </div>
  </PublicPage>;
}
