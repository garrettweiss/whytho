import type { Metadata } from "next";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/public/public.module.css";
export const metadata: Metadata = { title: "FAQ | WhyTho", description: "Questions about asking politicians, voting, response records, and verification." };
const sections = [
  { title: "Getting started", questions: [
    ["Does a profile mean the politician has joined?", "No. Profiles can be created from public records. Read the verification label to see the profile’s claim status. A listing does not imply endorsement."],
    ["Can I read without signing in?", "Yes. Public profiles, questions, and published responses are available to read. The question form will guide you to sign in when needed. Voting may use an anonymous session."],
    ["How do I search by office?", "Use a full office name such as U.S. Senate or State Senate, and optionally add a state. If you type Senate without a level, WhyTho asks which office you mean."],
  ]},
  { title: "Questions and votes", questions: [
    ["What should I ask?", "Ask a specific, civil question about the person’s public responsibilities, policies, or public statements. Use the report control on a question to flag spam, harassment, or other concerns."],
    ["How many questions can I submit?", "The current limit is five questions per user in a rolling 24-hour window, with at most three for the same politician in that window."],
    ["What makes a question qualifying?", "At least ten net votes, meaning upvotes minus downvotes. Qualifying questions determine the response-rate denominator. Current-week questions can receive votes; archived questions are read-only."],
    ["What are suggested questions?", "Some questions are generated from public records. They are labeled as AI-generated suggested questions and can be voted on like other current-week questions."],
  ]},
  { title: "Understanding the record", questions: [
    ["How is the response rate calculated?", "It is the number of qualifying questions with a published official response divided by all qualifying questions in the displayed period. Multiple responses to one question still count as one answered question. With no qualifying questions, no rate is shown."],
    ["Does AI analysis count as an answer from the politician?", "No. AI analysis is labeled separately. Only published, non-AI direct responses and team statements count as official responses."],
    ["Does no response mean the politician ignored me?", "It means no official response is recorded for that question. It does not establish whether the politician saw it or chose not to answer."],
    ["Why do counts or rates change?", "The displayed period, qualifying votes, and available published records determine the calculation. Public pages refresh periodically, so a new response may not appear immediately."],
  ]},
  { title: "For politicians", questions: [
    ["How do I claim a profile?", "Open For politicians, sign in, find the profile, and follow the claim and verification steps. Claiming alone is distinct from completing verification."],
    ["Which verification methods can I use?", "The current verification screen offers an official government email method and an official website meta-tag method. Follow the instructions and status shown there."],
    ["Can my team respond?", "Authorized team members can use the politician dashboard according to their assigned role. Published responses from authorized teams count as official responses."],
  ]},
];
export default function FaqPage() {
  return <PublicPage title="Questions about the questions." kicker="FAQ" description="A closer look at how asking, voting, and response records work.">
    <div className={styles.reading}>{sections.map(section => <section key={section.title}><h2>{section.title}</h2>{section.questions.map(([question,answer]) => <details key={question}><summary>{question}</summary><p>{answer}</p></details>)}</section>)}
      <section><h2>Need help?</h2><p>Contact <a href="mailto:support@whytho.us">support@whytho.us</a>.</p></section>
    </div>
  </PublicPage>;
}
