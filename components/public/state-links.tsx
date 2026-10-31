import Link from "next/link";
import { STATES } from "@/lib/search/states";
import styles from "./public.module.css";

export function StateLinks() {
  return <details data-directory-end className={styles.stateDetails}><summary>Browse by state</summary><nav className={styles.stateList} aria-label="State directories">{STATES.map(state => <Link key={state.code} href={`/region/${state.slug}`}>{state.name} <span aria-hidden="true">↗</span></Link>)}</nav></details>;
}
