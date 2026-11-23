import Link from "next/link";
import { PublicPage } from "@/components/public/public-layout";
import styles from "@/components/public/public.module.css";

export type PolicyContents = {
  title: string;
  sections: {
    heading: string;
    paragraphs: string[];
    definitions?: { information: string; source: string; purpose: string }[];
  }[];
};

function renderParagraph(text: string) {
  return text.split(/(\[[^\]]+\]\((?:mailto:[^\s)]+|\/[^\s)]*)\))/g).map((part, index) => {
    const link = /^\[([^\]]+)\]\(([^)]+)\)$/.exec(part);
    if (!link?.[1] || !link[2]) return part;
    const [, label, href] = link;
    return href.startsWith("mailto:")
      ? <a className="underline" key={index} href={href}>{label}</a>
      : <Link className="underline" key={index} href={href}>{label}</Link>;
  });
}

export function PolicyPage({ contents }: { contents: PolicyContents }) {
  return (
    <PublicPage title={contents.title} description="Updated November 23, 2026">
      <div className={styles.reading}>
        {contents.sections.map(({ heading, paragraphs, definitions }) => (
          <section key={heading}>
            <h2>{heading}</h2>
            {definitions && (
              <dl className="space-y-4">
                {definitions.map(({ information, source, purpose }) => (
                  <div className="border-b border-[#54565c] pb-4" key={information}>
                    <dt className="font-semibold">{information}</dt>
                    <dd className="text-sm text-[#b4b7bd]"><span className="font-semibold">Source</span> · {source}</dd>
                    <dd className="text-sm text-[#b4b7bd]"><span className="font-semibold">Use</span> · {purpose}</dd>
                  </div>
                ))}
              </dl>
            )}
            {paragraphs.map((paragraph, index) => <p key={index}>{renderParagraph(paragraph)}</p>)}
          </section>
        ))}
      </div>
    </PublicPage>
  );
}
