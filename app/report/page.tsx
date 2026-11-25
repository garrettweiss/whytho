import type { Metadata } from "next";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/public/public.module.css";

export const metadata: Metadata = {
  title: "Report a problem | WhyTho",
  description: "Contact WhyTho about content, privacy, intimate-image removal, copyright, or security.",
};

const intimateRequest = {
  subject: "Urgent intimate-image removal request",
  body: "Link to the image or video, and enough detail to locate it:\n\n"
    + "I am the person shown or am authorized to act for them. I believe in good faith that the image or video was published without their consent.\n\n"
    + "Full name or electronic signature:\n\nBest email or other contact method:\n",
};

const intimateEmail = "mailto:privacy@whytho.us?subject="
  + encodeURIComponent(intimateRequest.subject) + "&body=" + encodeURIComponent(intimateRequest.body);

export default function ReportPage() {
  return (
    <PublicPage
      title="Report a problem"
      description="Anyone can contact WhyTho. Include the page link and enough detail for us to find the issue."
    >
      <div className={styles.reading}>
        <section id="intimate-images" className="scroll-mt-24">
          <h2>Request intimate-image removal</h2>
          <p>
            If an intimate image or video of you was posted without your consent, you or someone you authorize can
            request removal. This includes digitally altered or AI-generated material. You can submit a request without
            signing in.
          </p>
          <p>Include all of the following in your written request:</p>
          <ul className="ml-6 list-disc space-y-2">
            <li>Your physical or electronic signature.</li>
            <li>The WhyTho page address and enough information to locate the image or video.</li>
            <li>A brief statement that you believe in good faith it was published without the consent of the person shown, with any information relevant to that determination.</li>
            <li>A way to contact you and, if you are making the request for someone else, your authority to act for them.</li>
          </ul>
          <p>Send the link and description. Please avoid attaching or forwarding the image or video itself.</p>
          <p><a className="underline" href={intimateEmail}>Email an urgent removal request</a> to privacy@whytho.us.</p>
        </section>
        <section>
          <h2>Content, account or accessibility</h2>
          <p>
            For harmful content, impersonation, factual errors, account help or accessibility concerns, email{" "}
            <a className="underline" href="mailto:support@whytho.us">support@whytho.us</a>.
          </p>
        </section>
        <section>
          <h2>Privacy and account closure</h2>
          <p>
            For a privacy concern, account closure or a request about your personal information, email{" "}
            <a className="underline" href="mailto:privacy@whytho.us">privacy@whytho.us</a>.
            Please keep passwords, sign-in codes and identity documents out of your message.
          </p>
        </section>
        <section>
          <h2>Copyright</h2>
          <p>
            If you own a work or are authorized to act for its owner, email{" "}
            <a className="underline" href="mailto:copyright@whytho.us">copyright@whytho.us</a>.
            Identify the work, link to the material on WhyTho and explain your relationship to the rights holder.
            Include contact information, your signature, and a statement that you believe in good faith the use is
            unauthorized and that the information is accurate and you are authorized to act, under penalty of perjury.
          </p>
        </section>
        <section>
          <h2>Security</h2>
          <p>
            Report a suspected vulnerability or account compromise privately to{" "}
            <a className="underline" href="mailto:security@whytho.us">security@whytho.us</a>.
            Identify the affected page or feature and describe what happened without including passwords or anyone else’s data.
          </p>
        </section>
      </div>
    </PublicPage>
  );
}
