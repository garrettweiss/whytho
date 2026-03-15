import Link from "next/link";
import { Tables } from "@/types/database";

type Snapshot = Pick<
  Tables<"weekly_snapshots">,
  "week_number" | "participation_rate" | "answered_qualifying" | "qualifying_questions"
>;

interface Props {
  currentRate: number | null;
  snapshots: Snapshot[];
  weekNumber: number;
  politicianSlug?: string; // if provided, history rows become archive links
}

function rateColor(rate: number | null): string {
  if (rate === null) return "text-muted-foreground";
  if (rate >= 75) return "text-green-600";
  if (rate >= 40) return "text-yellow-600";
  return "text-red-600";
}

function rateBg(rate: number): string {
  if (rate >= 75) return "bg-green-500";
  if (rate >= 40) return "bg-yellow-500";
  return "bg-red-500";
}

function Sparkline({ snapshots }: { snapshots: Snapshot[] }) {
  if (snapshots.length < 2) return null;

  // Reverse so oldest is leftmost
  const ordered = [...snapshots].reverse();
  const rates = ordered.map((s) => s.participation_rate ?? 0);
  const max = Math.max(...rates, 1);
  const width = 160;
  const height = 40;
  const padding = 4;

  const points = rates.map((r, i) => {
    const x = padding + (i / (rates.length - 1)) * (width - padding * 2);
    const y = height - padding - (r / max) * (height - padding * 2);
    return `${x},${y}`;
  });

  const polyline = points.join(" ");

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <polyline
        points={polyline}
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        strokeLinecap="round"
        className="text-muted-foreground/50"
      />
      {/* Highlight current (last) point */}
      {points.length > 0 && (() => {
        const last = points[points.length - 1]!.split(",");
        const x = parseFloat(last[0]!);
        const y = parseFloat(last[1]!);
        return (
          <circle
            cx={x}
            cy={y}
            r={3}
            fill="currentColor"
            className="text-foreground"
          />
        );
      })()}
    </svg>
  );
}

function WeekLabel(weekNumber: number): string {
  const year = Math.floor(weekNumber / 100);
  const week = weekNumber % 100;
  return `Week ${week}, ${year}`;
}

export function ParticipationRate({ currentRate, snapshots, weekNumber, politicianSlug }: Props) {
  const rate = currentRate ?? 0;

  return (
    <div className="rounded-xl border bg-card p-6 shadow-sm space-y-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-sm font-medium text-muted-foreground uppercase tracking-wide">
            Response Rate · {WeekLabel(weekNumber)}
          </h2>
          <div className="mt-1 flex items-baseline gap-2">
            <span className={`text-4xl font-bold tabular-nums ${rateColor(currentRate)}`}>
              {currentRate !== null ? `${Math.round(currentRate)}%` : "—"}
            </span>
            {currentRate === null && (
              <span className="text-sm text-muted-foreground">no qualifying questions yet</span>
            )}
          </div>
        </div>

        {/* Sparkline */}
        {snapshots.length >= 2 && (
          <div className="flex flex-col items-end gap-1">
            <span className="text-xs text-muted-foreground">8-week trend</span>
            <Sparkline snapshots={snapshots} />
          </div>
        )}
      </div>

      {/* Progress bar */}
      {currentRate !== null && (
        <div>
          <div className="h-2 rounded-full bg-muted overflow-hidden">
            <div
              className={`h-full rounded-full transition-all ${rateBg(rate)}`}
              style={{ width: `${Math.min(rate, 100)}%` }}
            />
          </div>
          <p className="mt-1.5 text-xs text-muted-foreground">
            Qualifying questions = those with 10+ net upvotes
          </p>
        </div>
      )}

      {/* Historical snapshots mini-table */}
      {snapshots.length > 0 && (
        <div className="border-t pt-4">
          <h3 className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">
            Recent History
          </h3>
          <div className="space-y-1.5">
            {snapshots.slice(0, 4).map((snap) => {
              const r = snap.participation_rate ?? 0;
              const isCurrentWeek = snap.week_number === weekNumber;
              const weekLabel = (
                <span className="w-24 text-muted-foreground shrink-0">
                  {WeekLabel(snap.week_number)}
                </span>
              );

              return (
                <div key={snap.week_number} className="flex items-center gap-3 text-xs">
                  {politicianSlug && !isCurrentWeek ? (
                    <Link
                      href={`/${politicianSlug}?week=${snap.week_number}`}
                      className="w-24 text-muted-foreground shrink-0 hover:text-foreground underline-offset-2 hover:underline"
                    >
                      {WeekLabel(snap.week_number)}
                    </Link>
                  ) : (
                    weekLabel
                  )}
                  <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className={`h-full rounded-full ${rateBg(r)}`}
                      style={{ width: `${Math.min(r, 100)}%` }}
                    />
                  </div>
                  <span className={`w-10 text-right font-medium tabular-nums ${rateColor(snap.participation_rate)}`}>
                    {snap.participation_rate !== null ? `${Math.round(r)}%` : "—"}
                  </span>
                  <span className="text-muted-foreground w-20 shrink-0">
                    {snap.answered_qualifying}/{snap.qualifying_questions} answered
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
