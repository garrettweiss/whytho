"use client";

import { useRouter, useSearchParams } from "next/navigation";

export type Period = "week" | "month" | "year" | "all";

const TABS: { value: Period; label: string }[] = [
  { value: "week",  label: "Week"     },
  { value: "month", label: "Month"    },
  { value: "year",  label: "Year"     },
  { value: "all",   label: "All Time" },
];

interface PeriodTabsProps {
  slug: string;
  /** Current active period — passed from server to avoid hydration mismatch */
  activePeriod: Period;
}

export function PeriodTabs({ slug, activePeriod }: PeriodTabsProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function navigate(period: Period) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("period", period);
    // Remove legacy ?week= param when switching to period tabs
    params.delete("week");
    router.push(`/${slug}?${params.toString()}`);
  }

  return (
    <div
      className="flex gap-1 rounded-lg border bg-muted p-1 w-fit"
      role="tablist"
      aria-label="Time period"
    >
      {TABS.map((tab) => (
        <button
          key={tab.value}
          role="tab"
          aria-selected={activePeriod === tab.value}
          onClick={() => navigate(tab.value)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            activePeriod === tab.value
              ? "bg-background shadow-sm text-foreground"
              : "text-muted-foreground hover:text-foreground"
          }`}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
