import type { ReactNode } from "react";
import Link from "next/link";
import { faceBody, faceDisplay } from "@/components/home/fonts";
import styles from "./dashboard.module.css";

export function DashboardShell({ children, loading = false }: { children: ReactNode; loading?: boolean }) {
  return <main id="public-content" tabIndex={-1} className={`${styles.surface} ${faceBody.variable} ${faceDisplay.variable}`}>
    <div className={styles.container}>
      <header className={styles.pageHeader}>
        <div>
          <p className={styles.eyebrow}>Your team workspace</p>
          <h1>Make your answer count.</h1>
          <p className={styles.intro}>Respond to questions, review drafts, and manage your public profile.</p>
        </div>
        {!loading && <Link href="/verify" className={styles.secondaryButton}>Manage verification <span aria-hidden="true">↗</span></Link>}
      </header>
      {children}
    </div>
  </main>;
}
