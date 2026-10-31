import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/public/public.module.css";
export const metadata: Metadata = { title: "About | WhyTho", description: "A public place to ask politicians questions and explore their response records." };
export default function AboutPage() {
  return <PublicPage title="Public office. Public questions." kicker="About WhyTho" description="A direct question deserves a place on the record.">
    <div className={styles.reading}>
      <section><h2>Start with the person.</h2><p>WhyTho brings questions to the people who hold public office and those seeking it. Find a politician, read what people are asking, and add the question you want answered.</p><p>Profiles exist independently of whether a politician has joined. A listing is not an endorsement by the person or by WhyTho.</p></section>
      <section><h2>Make the question count.</h2><p>The community votes on current questions. Questions with at least ten net votes qualify for the response-rate calculation. Politicians and their teams can publish responses on their profiles.</p></section>
      <section><h2>Read the record carefully.</h2><p>Published official responses, AI analysis, and suggested questions have different labels. AI analysis never counts as an official response. The absence of a recorded response does not prove that a politician saw or declined a question.</p><p>Each record shows its reporting period. Missing data stays unknown, and a politician with no qualifying questions has no response rate for that period.</p></section>
      <section><h2>Have a public role?</h2><p>Claim your profile and complete verification to participate as a politician or authorized team member.</p><Link className={styles.button} href="/verify">Claim your profile →</Link></section>
      <section><h2>Independent civic engagement.</h2><p>WhyTho is an independent civic technology project. The questions and response records use the same rules across political parties.</p><div className={styles.actions}><Link href="/how-it-works">How it works →</Link><Link href="/faq">Common questions →</Link></div></section>
    </div>
  </PublicPage>;
}
