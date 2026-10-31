import { DashboardShell } from "@/components/dashboard/dashboard-shell";
import styles from "@/components/dashboard/dashboard.module.css";

export default function DashboardLoading() {
  return <DashboardShell loading><div aria-busy="true"><p role="status" className={styles.meta}>Loading your dashboard…</p>{[0, 1, 2].map(row => <div key={row} className={styles.loadingRow} aria-hidden="true" />)}</div></DashboardShell>;
}
