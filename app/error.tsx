"use client";

import { useEffect } from "react";
import Link from "next/link";

interface Props {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function GlobalError({ error, reset }: Props) {
  useEffect(() => {
    // Log to Sentry in production
    if (process.env.NODE_ENV === "production") {
      console.error("[WhyTho] Unhandled error:", error);
    }
  }, [error]);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center px-4">
      <div className="max-w-sm w-full text-center space-y-5">
        <div className="space-y-2">
          <p className="text-4xl font-bold">500</p>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="text-sm text-muted-foreground">
            We hit an unexpected error. Our team has been notified.
          </p>
          {error.digest && (
            <p className="text-xs text-muted-foreground font-mono">
              Error ID: {error.digest}
            </p>
          )}
        </div>
        <div className="flex flex-col gap-2">
          <button
            onClick={reset}
            className="w-full rounded-lg bg-foreground text-background px-4 py-2.5 text-sm font-semibold hover:opacity-90 transition-opacity"
          >
            Try again
          </button>
          <Link
            href="/"
            className="w-full rounded-lg border px-4 py-2.5 text-sm font-medium hover:bg-muted transition-colors text-center"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
