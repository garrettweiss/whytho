import type { ReactNode } from "react";
import Link from "next/link";
import { faceBody, faceDisplay } from "@/components/home/fonts";
import { PublicPortrait } from "./public-portrait";
import styles from "./public.module.css";

export function PublicPage({ title, description, kicker, breadcrumbs = [], action, children }: {
  title: string; description: string; kicker?: string;
  breadcrumbs?: { label: string; href: string }[]; action?: ReactNode; children: ReactNode;
}) {
  return <main id="public-content" tabIndex={-1} className={`${styles.surface} ${faceBody.variable} ${faceDisplay.variable}`}>
    <div className={styles.container}>
      <nav aria-label="Breadcrumb" className={styles.breadcrumbs}>
        <Link href="/#find-politician">Find a politician</Link>
        {breadcrumbs.map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}
      </nav>
      <header className={styles.pageHeader}>
        <div>{kicker && <p className={styles.kicker}>{kicker}</p>}<h1>{title}</h1><p className={styles.description}>{description}</p></div>
        {action && <div className={styles.headerAction}>{action}</div>}
      </header>
      {children}
      <footer className={styles.footer}><Link href="/#find-politician">Find a politician</Link><Link href="/federal">U.S. officials</Link><Link href="/leaderboard">Response leaderboard</Link><Link href="/races">Elections</Link><Link href="/how-it-works">How it works</Link><Link href="/about">About</Link><Link href="/faq">FAQ</Link></footer>
    </div>
  </main>;
}

export type PublicPerson = { slug: string; full_name: string; photo_url: string | null; office?: string | null; state?: string | null; party?: string | null };
export function PublicPersonLink({ person, eyebrow, detail, trailing }: { person: PublicPerson; eyebrow?: ReactNode; detail?: ReactNode; trailing?: ReactNode }) {
  return <Link href={`/${person.slug}`} prefetch={false} className={styles.personCard}>
    <PublicPortrait name={person.full_name} url={person.photo_url} />
    <div className={styles.personCopy}>{eyebrow && <p className={styles.meta}>{eyebrow}</p>}<h3 className={styles.personName}>{person.full_name}</h3><p className={styles.personMeta}>{[person.office, person.state, person.party].filter(Boolean).join(" · ")}</p>{detail && <p className={styles.personMeta}>{detail}</p>}<span className={styles.personAction}>View questions <span aria-hidden="true">↗</span></span></div>
    {trailing && <div className={styles.personTrailing}>{trailing}</div>}
  </Link>;
}

export function PublicLoading({ label }: { label: string }) {
  return <PublicPage title={label} description="Loading the public record…"><div aria-busy="true" aria-label={label} className={styles.loading}><p role="status">Loading…</p>{[0,1,2].map(row => <div key={row} className={styles.loadingRow} aria-hidden="true" />)}</div></PublicPage>;
}
