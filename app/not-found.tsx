import Link from "next/link";
import { PoliticianSearch } from "@/components/politician/politician-search";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="space-y-2">
          <p className="text-5xl font-bold">404</p>
          <h1 className="text-xl font-semibold">Page not found</h1>
          <p className="text-sm text-muted-foreground">
            That politician profile or page doesn&apos;t exist. Try searching below.
          </p>
        </div>

        <PoliticianSearch />

        <div className="flex flex-col gap-2 pt-2">
          <Link
            href="/"
            className="w-full rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity text-center"
          >
            Go home
          </Link>
          <Link
            href="/leaderboard"
            className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors text-center"
          >
            View leaderboard
          </Link>
        </div>
      </div>
    </div>
  );
}
