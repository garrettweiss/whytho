import type { Metadata } from "next";
import { getDirectoryPage } from "@/lib/directory/server";
import { federalChamberOffice } from "@/lib/directory/scope";
import { PublicPage } from "@/components/public/public-layout";
import { ScopedDirectory } from "@/components/public/scoped-directory";
import { StateLinks } from "@/components/public/state-links";
export const metadata: Metadata = { title: "U.S. officials | WhyTho", description: "Find the President, Cabinet, governors and members of Congress. Read their questions and ask your own." };
export const revalidate = 300;
export default async function FederalPage({ searchParams }: { searchParams: Promise<{ chamber?: string }> }) {
  const { chamber } = await searchParams;
  const initialPage = await getDirectoryPage({ q: "", state: "", office: federalChamberOffice(chamber), scope: "national" });
  return <PublicPage title="U.S. officials." kicker="The people. The questions. The record." description="From the President and Cabinet to Congress and governors. Choose a name, state, or office to find who you want an answer from.">
    <ScopedDirectory initialPage={initialPage} context={{ basePath: "/federal", scope: "national" }} />
    <StateLinks />
  </PublicPage>;
}
