import Link from "next/link";
import { faceBody } from "@/components/home/fonts";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import styles from "./legal-footer.module.css";

const FOOTER_LINKS = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/races", label: "Elections" },
  { href: "/verify", label: "For politicians" },
  { href: "/privacy", label: "Privacy" },
  { href: "/terms", label: "Terms" },
  { href: "/report", label: "Report a problem" },
];

/** Single site-wide footer: brand line on the left, site and legal links on one row to the right. */
export function SiteFooter() {
  return (
    <footer className={`${styles.footer} ${faceBody.variable}`}>
      <div className={styles.inner}>
        <p className={styles.brand}>whytho? · Questions deserve answers.</p>
        <nav aria-label="Site and legal links" className={styles.links}>
          {FOOTER_LINKS.map(link => <Link key={link.href} href={link.href}>{link.label}</Link>)}
        </nav>
      </div>
      <div className="mobile-theme-footer">
        <ThemeToggle placement="footer" />
      </div>
    </footer>
  );
}
