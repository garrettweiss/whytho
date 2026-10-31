"use client";
import { useState } from "react";
import styles from "./public.module.css";

export function PublicPortrait({ name, url }: { name: string; url: string | null }) {
  const [failed, setFailed] = useState(false);
  const safe = url && /^https?:\/\//i.test(url);
  return <div className={styles.personPhoto}>
    {/* Native images avoid proxying external civic-image hosts. */}
    {/* eslint-disable-next-line @next/next/no-img-element */}
    {safe && !failed ? <img src={url} width={240} height={300} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} /> : <span aria-hidden="true">{name.split(/\s+/).map(part => part[0]).slice(0,2).join("")}</span>}
  </div>;
}
