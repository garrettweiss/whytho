import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/public/public.module.css";
export const metadata: Metadata = { title: "How it works | WhyTho", description: "Find a politician, ask a question, and follow the response record." };
const steps = [
  ["01", "Find who you want to ask.", "Search a name, state, or office. U.S. Senate and State Senate are separate choices. Open a profile to see that person’s questions and published responses."],
  ["02", "Ask clearly. Vote thoughtfully.", "Ask about the politician’s public responsibilities. Be specific and civil. Vote on current-week questions you want to see addressed. Archived questions remain available to read."],
  ["03", "Ten net votes makes it qualifying.", "Net votes are upvotes minus downvotes. A question with at least ten net votes enters the denominator of that politician’s response rate for the displayed period."],
  ["04", "Look for an official response.", "Published direct responses and team statements count as official. AI analysis of the public record is labeled separately and does not count. A response to one question does not mean every question was answered."],
  ["05", "Follow the record over time.", "The site organizes questions by week. Profile period links let you explore recent questions, all-time records, and archived weeks. The leaderboard compares official responses to qualifying questions in the current week."],
];
export default function HowItWorksPage() {
  return <PublicPage title="Find. Ask. Follow up." kicker="How it works" description="Political engagement starts with a person and a question.">
    <div className={styles.reading}>{steps.map(([number,title,description]) => <section key={number}><p className={styles.kicker}>Step {number}</p><h2>{title}</h2><p>{description}</p></section>)}
      <section><h2>What the colors mean.</h2><p>Green marks a published official response in the displayed record. Neutral labels indicate no recorded response or no questions. A missing response does not establish that a politician saw or skipped a question.</p><p>A profile’s verification label describes its claim status. AI-generated questions and analysis are always identified separately.</p></section>
      <div className={styles.actions}><Link href="/#find-politician" className={styles.button}>Find a politician →</Link><Link href="/verify" className={styles.button}>For politicians →</Link></div>
    </div>
  </PublicPage>;
}
