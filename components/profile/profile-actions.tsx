"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import styles from "./profile.module.css";

export function AskQuestionLink() {
  return <a className={styles.primaryAction} href="#ask-question" onClick={() => {
    requestAnimationFrame(() => document.querySelector<HTMLElement>('#ask-question textarea, #ask-question a, #ask-question button')?.focus());
  }}>Ask a question <span aria-hidden="true">↗</span></a>;
}

export function QuestionAnchorNotice({ slug, displayedIds }: { slug: string; displayedIds: string[] }) {
  const [missing, setMissing] = useState(false);
  useEffect(() => {
    const check = () => {
      const hash = window.location.hash;
      if (!/^#question-[0-9a-f-]+$/i.test(hash)) { setMissing(false); return; }
      const found = displayedIds.includes(hash.slice("#question-".length));
      setMissing(!found);
      if (found) requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView());
    };
    check(); window.addEventListener("hashchange", check);
    return () => window.removeEventListener("hashchange", check);
  }, [displayedIds]);
  if (!missing) return null;
  return <p className={styles.notice} role="status">That question isn’t in the questions shown for this period. It may be from another week or unavailable. <Link href={`/${slug}?period=all`}>Browse all periods</Link></p>;
}
