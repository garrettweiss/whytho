"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useUser } from "@/lib/auth/use-user";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/federal", label: "Federal" },
];

export function SiteNav() {
  const pathname = usePathname();
  const { user, isLoading } = useUser();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  return (
    <nav className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40">
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          href="/"
          className="font-bold text-sm tracking-tight hover:text-muted-foreground transition-colors"
        >
          WhyTho
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                isActive(link.href)
                  ? "bg-muted text-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
              }`}
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Auth links */}
        {!isLoading && (
          <div className="flex items-center gap-2">
            {user && !user.is_anonymous ? (
              <>
                <Link
                  href="/dashboard"
                  className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                    isActive("/dashboard")
                      ? "bg-muted text-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                  }`}
                >
                  Dashboard
                </Link>
                <Link
                  href="/sign-in"
                  className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                >
                  Sign out
                </Link>
              </>
            ) : (
              <Link
                href="/verify"
                className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
              >
                Are you a politician?
              </Link>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
