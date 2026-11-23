import type { Metadata } from "next";
import Link from "next/link";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/verify/verify.module.css";
import { createClient } from "@/lib/supabase/server";
import { SuggestMayorForm } from "./suggest-mayor-form";

export const metadata: Metadata = {
  title: "Suggest a Mayor | WhyTho",
  description: "Suggest a mayor for the WhyTho directory.",
};

export default async function SuggestMayorPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  return <PublicPage title="Suggest a mayor" description="Share your mayor’s official city page so WhyTho can confirm who holds office before adding a profile.">
    <div className={styles.layout}>
      {user && !user.is_anonymous ? <SuggestMayorForm /> : <section className={styles.wizard}>
        <Link className={styles.primary} href="/sign-in?redirect=%2Fsuggest-mayor">Sign in to suggest a mayor</Link>
      </section>}
    </div>
  </PublicPage>;
}
