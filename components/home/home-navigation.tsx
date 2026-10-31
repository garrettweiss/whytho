"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { faceBody, faceDisplay } from "./fonts";
import styles from "./home.module.css";

export function HomeNavigation({ loggedIn, loading, politicianMode, canUsePoliticianMode = false, onToggleMode, isHome = true, skipTarget, skipLabel }: { loggedIn: boolean; loading: boolean; politicianMode: boolean; canUsePoliticianMode?: boolean; onToggleMode?: () => void; isHome?: boolean; skipTarget?: string; skipLabel?: string }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname]);
  const searchHref = isHome ? "#find-politician" : "/#find-politician";
  const howHref = isHome ? "#how-it-works" : "/#how-it-works";
  const toggle = useRef<HTMLButtonElement>(null);
  const disclosure = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function keydown(event: KeyboardEvent) {
      if (event.key === "Escape") { setOpen(false); toggle.current?.focus(); }
    }
    function outside(event: PointerEvent) {
      if (!disclosure.current?.contains(event.target as Node)) setOpen(false);
    }
    document.addEventListener("keydown", keydown);
    document.addEventListener("pointerdown", outside);
    return () => { document.removeEventListener("keydown", keydown); document.removeEventListener("pointerdown", outside); };
  }, [open]);
  return (
    <header className={`${styles.theme} ${styles.header} ${faceDisplay.variable} ${faceBody.variable}`}>
      <a className={styles.skipLink} href={skipTarget ?? (isHome ? "#find-politician" : "#profile-questions")}>{skipLabel ?? (isHome ? "Skip to search" : "Skip to questions")}</a>
      <div className={styles.headerInner}>
        <Link href="/" className={styles.logo} aria-label="WhyTho home">whytho?</Link>
        <nav className={styles.desktopNav} aria-label="Main navigation">
          <a href={searchHref} aria-current={isHome ? "page" : undefined}>Find a politician</a>
          <a href={howHref}>How it works</a>
          <Link href="/verify">For politicians <span aria-hidden="true">↗</span></Link>
        </nav>
        <div className={styles.headerRight}>
          <Link className={styles.accountLink} href={loggedIn ? "/account" : "/sign-in"} aria-busy={loading}>{loading ? "Account" : loggedIn ? "My account" : "Sign in"}</Link>
          <div ref={disclosure} className={styles.navDisclosure}>
            <button ref={toggle} className={styles.menuToggle} aria-label={open ? "Close navigation" : "Open navigation"} aria-expanded={open} aria-controls="home-navigation" onClick={() => setOpen(!open)}><span aria-hidden="true">{open ? "×" : "☰"}</span></button>
            {open && <nav id="home-navigation" className={styles.mobileNav} aria-label="More navigation" onClick={() => setOpen(false)}>
              <a href={searchHref}>Find a politician</a><a href={howHref}>How it works</a><Link href="/federal">U.S. officials</Link><Link href="/leaderboard">Leaderboard</Link><Link href="/races">Elections</Link><Link href="/verify">For politicians</Link>
              {canUsePoliticianMode && <><Link href="/dashboard">Politician dashboard</Link><button type="button" onClick={() => { onToggleMode?.(); setOpen(false); requestAnimationFrame(() => toggle.current?.focus()); }}>{politicianMode ? "Switch to citizen view" : "Switch to politician mode"}</button></>}
              {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- Sign-out must use a full navigation without prefetching. */}
              {loggedIn && <a href="/auth/sign-out">Sign out</a>}
            </nav>}
          </div>
        </div>
      </div>
    </header>
  );
}
