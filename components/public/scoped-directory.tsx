import { PoliticianDirectory } from "@/components/home/politician-directory";
import type { DirectoryPage } from "@/lib/directory/types";
import type { DirectoryContext } from "@/lib/directory/scope";
import homeStyles from "@/components/home/home.module.css";

export function ScopedDirectory({ initialPage, context }: { initialPage: DirectoryPage; context: DirectoryContext }) {
  return <div className={homeStyles.theme}><PoliticianDirectory initialPage={initialPage} context={context} /></div>;
}
