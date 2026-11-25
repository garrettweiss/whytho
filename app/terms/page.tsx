import type { Metadata } from "next";
import { PolicyPage } from "@/components/legal/policy-page";
import contents from "@/components/legal/terms.json";

export const metadata: Metadata = {
  title: "Terms of use | WhyTho",
  description: "WhyTho’s terms for participation, office teams, public responses, and the civic archive.",
};

export default function TermsPage() {
  return <PolicyPage contents={contents} />;
}
