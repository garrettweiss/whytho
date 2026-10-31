import { notFound } from "next/navigation";
import type { Metadata } from "next";
import Link from "next/link";
import { stateBySlug } from "@/lib/search/states";
import { getDirectoryPage } from "@/lib/directory/server";
import { PublicPage } from "@/components/public/public-layout";
import { ScopedDirectory } from "@/components/public/scoped-directory";
import { StateLinks } from "@/components/public/state-links";
import styles from "@/components/public/public.module.css";
export const revalidate = 300;
type Props = { params: Promise<{ state: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const state = stateBySlug((await params).state);
  return state ? { title: `${state.name} politicians | WhyTho`, description: `Find politicians in ${state.name}, explore their questions and ask your own.` } : { title: "State not found | WhyTho" };
}

export default async function RegionPage({ params }: Props) {
  const state = stateBySlug((await params).state);
  if (!state) notFound();
  const initialPage = await getDirectoryPage({ q: "", state: state.code, office: "" });
  return <PublicPage title={state.name} kicker={state.code === "DC" ? "Federal and district offices" : "Federal and state offices"} description={`Who represents ${state.name}? Find a politician, read the questions, and add yours.`}>
    <nav className={styles.tabs} aria-label="Directory scope"><Link href={`/region/${state.slug}`} aria-current="page">All offices in {state.name}</Link>{state.code !== "DC" && <Link href={`/state/${state.code.toLowerCase()}`}>State offices only</Link>}</nav>
    <ScopedDirectory initialPage={initialPage} context={{ basePath: `/region/${state.slug}`, state: state.code }} />
    <StateLinks />
  </PublicPage>;
}
