import Link from "next/link";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/public/public.module.css";
export default function NotFound() {
  return <PublicPage title="That page isn’t here." kicker="404" description="We couldn’t find that profile or page. Search for a politician to keep exploring.">
    <span id="profile-questions" tabIndex={-1} />
    <div className={styles.actions}><Link className={styles.button} href="/#find-politician">Find a politician →</Link><Link className={styles.button} href="/">Go home</Link></div>
  </PublicPage>;
}
