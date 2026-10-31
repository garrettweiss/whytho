"use client";

/** Browser tracking is paused pending an approved privacy notice and consent flow. */
export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
