export default function LeaderboardLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Title skeleton */}
        <div className="space-y-2 animate-pulse">
          <div className="h-8 bg-muted rounded w-56" />
          <div className="h-4 bg-muted rounded w-72" />
        </div>

        {/* Row skeletons */}
        <div className="space-y-2">
          {[...Array(12)].map((_, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-xl border bg-card px-4 py-3 animate-pulse"
            >
              <div className="h-5 w-5 bg-muted rounded shrink-0" />
              <div className="h-10 w-10 rounded-full bg-muted shrink-0" />
              <div className="flex-1 space-y-1.5">
                <div className="h-4 bg-muted rounded w-36" />
                <div className="h-3 bg-muted rounded w-52" />
              </div>
              <div className="shrink-0 space-y-1 text-right">
                <div className="h-5 bg-muted rounded w-12 ml-auto" />
                <div className="h-2 bg-muted rounded-full w-20 ml-auto" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
