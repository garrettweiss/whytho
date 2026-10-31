"use client";

import { useState } from "react";
import styles from "./profile.module.css";

export function ProfilePortrait({ photoUrl, name, responded }: { photoUrl: string | null; name: string; responded: boolean }) {
  const [failed, setFailed] = useState(false);
  const [color, setColor] = useState(false);
  const initials = name.split(/\s+/).map(part => part[0]).slice(0, 2).join("");
  if (!photoUrl || failed) return <div className={styles.portraitFallback} aria-label={`No portrait available for ${name}`}><span aria-hidden="true">{initials}</span></div>;
  return <button type="button" className={`${styles.portrait} ${color ? styles.colorPortrait : ""} ${responded ? styles.respondedPortrait : ""}`} aria-label={`${color ? "Hide" : "Show"} portrait color for ${name}`} aria-pressed={color} onClick={() => setColor(!color)}>
    {/* Native images avoid proxying arbitrary civic-photo hosts. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    <img src={photoUrl} alt="" width={400} height={500} referrerPolicy="no-referrer" onError={() => setFailed(true)} />
  </button>;
}
