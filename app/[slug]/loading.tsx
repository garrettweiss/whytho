import { faceBody, faceDisplay } from "@/components/home/fonts";
import styles from "@/components/profile/profile.module.css";

export default function PoliticianProfileLoading() {
  return <main className={`${styles.surface} ${faceBody.variable} ${faceDisplay.variable}`} aria-busy="true" aria-label="Loading politician profile">
    <div className={styles.container}>
      <p className={styles.notice} role="status">Loading the public record…</p>
      <div className={styles.loadingLayout} aria-hidden="true">
        <div className={styles.loadingPortrait} />
        <div><div className={styles.loadingLine} /><div className={styles.loadingTitle} /><div className={styles.loadingLine} /></div>
      </div>
      <div aria-hidden="true">{[0, 1, 2].map((row) => <div key={row} className={styles.loadingQuestion}><div className={styles.loadingTitle} /><div className={styles.loadingLine} /></div>)}</div>
    </div>
  </main>;
}
