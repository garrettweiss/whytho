import type { Metadata } from "next";
import Link from "next/link";
import { PoliticianDirectory } from "@/components/home/politician-directory";
import { faceBody, faceDisplay } from "@/components/home/fonts";
import { getDirectoryPage } from "@/lib/directory/server";
import styles from "@/components/home/home.module.css";

export const revalidate = 300;
export const metadata: Metadata = {
  title: "WhyTho? Find a politician. Ask a question.",
  description: "Find U.S. politicians by name, state, or office. Ask questions, vote for the ones you want answered, and see their official responses.",
};

export default async function HomePage() {
  const initialPage = await getDirectoryPage({ q: "", state: "", office: "" });
  return <main className={`${styles.theme} ${styles.shell} ${faceDisplay.variable} ${faceBody.variable}`}>
    <div className={styles.container}>
      <section className={styles.hero} aria-labelledby="home-title">
        <h1 id="home-title">Who do you want an answer from?</h1>
        <p>Find a politician. Ask a question. Vote for the questions you want answered.</p>
      </section>
      <PoliticianDirectory initialPage={initialPage} />
      <section id="how-it-works" className={styles.howItWorks} aria-labelledby="how-title">
        <h2 id="how-title">Your questions.<br />On the record.</h2>
        <div className={styles.steps}>
          <div><h3>01. Find your politician</h3><p>Search for a name, your state, or an office. Open a profile to see what people are asking.</p></div>
          <div><h3>02. Ask. Or add your vote.</h3><p>Submit a question or vote for one you want answered. Public support helps questions rise.</p></div>
          <div><h3>03. Follow the response</h3><p>Read official replies and clearly labeled AI analysis. Past weeks stay on the record.</p></div>
        </div>
      </section>
      <footer className={styles.footer}><p>whytho? · Questions deserve answers.</p><nav aria-label="Footer navigation"><Link href="/leaderboard">Leaderboard</Link><Link href="/races">Elections</Link><Link href="/verify">For politicians</Link><a href="#find-politician">Back to search</a></nav></footer>
    </div>
  </main>;
}
