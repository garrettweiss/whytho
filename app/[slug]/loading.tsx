export default function PoliticianProfileLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
        {/* Header skeleton */}
        <div className="rounded-xl border bg-card p-5 animate-pulse">
          <div className="flex gap-4 items-start">
            <div className="h-20 w-20 rounded-full bg-muted shrink-0" />
            <div className="flex-1 space-y-2 pt-1">
              <div className="h-6 bg-muted rounded w-48" />
              <div className="h-4 bg-muted rounded w-64" />
              <div className="h-4 bg-muted rounded w-36" />
            </div>
          </div>
        </div>

        {/* Participation rate skeleton */}
        <div className="rounded-xl border bg-card p-5 animate-pulse space-y-3">
          <div className="h-4 bg-muted rounded w-40" />
          <div className="h-8 bg-muted rounded w-24" />
          <div className="h-2 bg-muted rounded-full w-full" />
          <div className="flex justify-between">
            <div className="h-3 bg-muted rounded w-20" />
            <div className="h-3 bg-muted rounded w-20" />
          </div>
        </div>

        {/* Question list skeleton */}
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="rounded-xl border bg-card p-4 animate-pulse space-y-2">
              <div className="flex gap-3">
                <div className="h-8 w-8 bg-muted rounded shrink-0" />
                <div className="flex-1 space-y-2">
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-4 bg-muted rounded w-4/5" />
                  <div className="h-3 bg-muted rounded w-24" />
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
