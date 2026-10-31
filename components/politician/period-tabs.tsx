import Link from "next/link";
import styles from "@/components/profile/profile.module.css";

export type Period = "week" | "month" | "year" | "all";

const TABS: { value: Period; label: string }[] = [
  { value: "week", label: "This week" },
  { value: "month", label: "Past 28 days" },
  { value: "year", label: "Past 365 days" },
  { value: "all", label: "All time" },
];

interface PeriodTabsProps {
  slug: string;
  /** Current active period, passed from the server. */
  activePeriod: Period;
}

export function PeriodTabs({ slug, activePeriod }: PeriodTabsProps) {
  return (
    <nav className={styles.periods} aria-label="Question period">
      {TABS.map((tab) => (
        <Link
          key={tab.value}
          href={`/${slug}?period=${tab.value}#profile-questions`}
          aria-current={activePeriod === tab.value ? "page" : undefined}
        >
          {tab.label}
        </Link>
      ))}
    </nav>
  );
}
