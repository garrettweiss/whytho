export default function HomeLoading() {
  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-16 space-y-14">
        {/* Hero skeleton */}
        <div className="flex flex-col items-center gap-3 animate-pulse">
          <div className="h-12 bg-muted rounded w-36" />
          <div className="h-5 bg-muted rounded w-80" />
          <div className="h-4 bg-muted rounded w-40" />
        </div>

        {/* Search skeleton */}
        <div className="h-11 bg-muted rounded-lg w-full animate-pulse" />

        {/* Stats skeleton */}
        <div className="flex justify-center gap-8 animate-pulse">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="h-9 w-20 bg-muted rounded" />
              <div className="h-3 w-28 bg-muted rounded" />
            </div>
          ))}
        </div>

        {/* CTA buttons skeleton */}
        <div className="flex gap-3 justify-center animate-pulse">
          <div className="h-11 w-40 bg-muted rounded-lg" />
          <div className="h-11 w-40 bg-muted rounded-lg" />
        </div>

        {/* Top questions skeleton */}
        <div className="space-y-3 animate-pulse">
          <div className="h-5 bg-muted rounded w-44" />
          {[...Array(4)].map((_, i) => (
            <div key={i} className="rounded-lg border bg-card px-4 py-3">
              <div className="flex gap-3">
                <div className="h-5 w-5 bg-muted rounded shrink-0 mt-0.5" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-4 bg-muted rounded w-full" />
                  <div className="h-3 bg-muted rounded w-3/4" />
                  <div className="h-3 bg-muted rounded w-40" />
                </div>
                <div className="h-4 w-10 bg-muted rounded shrink-0" />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
