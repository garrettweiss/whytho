import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { STATES, stateByCode } from "@/lib/search/states";
import { getDirectoryPage } from "@/lib/directory/server";
import { PublicPage } from "@/components/public/public-layout";
import { ScopedDirectory } from "@/components/public/scoped-directory";
import { StateLinks } from "@/components/public/state-links";
import styles from "@/components/public/public.module.css";
export const revalidate = 300;
type Props = { params: Promise<{ code: string }> };
export function generateStaticParams() { return STATES.map(state => ({ code: state.code.toLowerCase() })); }
export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const state = stateByCode((await params).code);
  return state ? { title: `${state.name} state politicians | WhyTho`, description: `Ask state legislators and other state officials in ${state.name} a question.` } : { title: "State not found | WhyTho" };
}
export default async function StatePage({ params }: Props) {
  const state = stateByCode((await params).code);
  if (!state) notFound();
  if (state.code === "DC") redirect(`/region/${state.slug}`);
  const initialPage = await getDirectoryPage({ q: "", state: state.code, office: "", scope: "state" });
  return <PublicPage title={state.name} kicker="State offices" description="The decisions made closer to home. Ask your state legislators, governor, and other state officials a question.">
    <nav className={styles.tabs} aria-label="Directory scope"><Link href={`/region/${state.slug}`}>All offices in {state.name}</Link><Link href={`/state/${state.code.toLowerCase()}`} aria-current="page">State offices only</Link></nav>
    <ScopedDirectory initialPage={initialPage} context={{ basePath: `/state/${state.code.toLowerCase()}`, state: state.code, scope: "state" }} />
    <p className={styles.footnote}>This directory includes governors, state legislators, and other explicitly state-titled offices. For offices whose jurisdiction is not specified in our records, use All offices in {state.name}.</p>
    <StateLinks />
  </PublicPage>;
}
