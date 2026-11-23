import type { Metadata } from "next";
import { PolicyPage } from "@/components/legal/policy-page";
import contents from "@/components/legal/privacy.json";

export const metadata: Metadata = {
  title: "Privacy notice | WhyTho",
  description: "How WhyTho uses and protects information and how to make a privacy request.",
};

export default function PrivacyPage() {
  return <PolicyPage contents={contents} />;
}
