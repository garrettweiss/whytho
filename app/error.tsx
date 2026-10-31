"use client";

import { useEffect } from "react";
import Link from "next/link";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/public/public.module.css";
import * as Sentry from "@sentry/nextjs";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // This previously only called console.error, so the copy below promising the
    // team had been notified was untrue and no alert ever fired.
    Sentry.captureException(error);
    if (process.env.NODE_ENV !== "production") {
      console.error("[WhyTho] Unhandled error:", error);
    }
  }, [error]);

  return <PublicPage title="This page couldn’t load." kicker="Something went wrong" description="Please try again, or return to the politician directory.">
    <span id="profile-questions" tabIndex={-1} />
    <div role="alert" className={styles.notice}>{error.digest && <p>Error reference: {error.digest}</p>}<div className={styles.actions}><button onClick={reset} className={styles.button}>Try again</button><Link href="/" className={styles.button}>Go home</Link></div></div>
  </PublicPage>;
}
