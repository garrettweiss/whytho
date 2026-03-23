"use client";

import { useEffect, Suspense } from "react";
import { usePathname, useSearchParams, useRouter } from "next/navigation";
import { initPostHog, posthog, trackUserRegistered } from "@/lib/analytics/posthog-client";

function PostHogPageView() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();

  // Init on mount
  useEffect(() => {
    initPostHog();
  }, []);

  // Track page views on route change
  useEffect(() => {
    if (!pathname) return;
    const url =
      pathname + (searchParams.toString() ? `?${searchParams.toString()}` : "");
    posthog.capture("$pageview", { $current_url: url });
  }, [pathname, searchParams]);

  // Fire user_registered when auth callback sets ?new_user=1
  useEffect(() => {
    if (searchParams.get("new_user") !== "1") return;

    trackUserRegistered("magic_link");

    // Strip the param from the URL without a full navigation
    const params = new URLSearchParams(searchParams.toString());
    params.delete("new_user");
    const clean = pathname + (params.toString() ? `?${params.toString()}` : "");
    router.replace(clean);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return null;
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return (
    <>
      <Suspense fallback={null}>
        <PostHogPageView />
      </Suspense>
      {children}
    </>
  );
}
