"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useUser } from "@/lib/auth/use-user";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/federal", label: "Federal" },
];

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useUser();

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname.startsWith(href);

  const isLoggedIn = user && !user.is_anonymous;
  const avatarInitial = user?.email?.[0]?.toUpperCase() ?? "U";

  return (
    <nav
      aria-label="Main navigation"
      className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40"
    >
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center justify-between gap-4">
        {/* Logo */}
        <Link
          href="/"
          aria-label="WhyTho — home"
          className="font-bold text-sm tracking-tight hover:text-muted-foreground transition-colors"
        >
          WhyTho
        </Link>

        {/* Nav links */}
        <div className="flex items-center gap-1" role="list">
          {NAV_LINKS.map((link) => {
            const active = isActive(link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? "bg-muted text-foreground"
                    : "text-muted-foreground hover:text-foreground hover:bg-muted/50"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </div>

        {/* Auth area */}
        {!isLoading && (
          <div className="flex items-center gap-2">
            {isLoggedIn ? (
              /* Logged-in: account avatar + dropdown */
              <DropdownMenu>
                <DropdownMenuTrigger
                  aria-label="Account menu"
                  className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer"
                >
                  {avatarInitial}
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  {user?.email && (
                    <>
                      <DropdownMenuLabel className="text-xs font-normal truncate">
                        {user.email}
                      </DropdownMenuLabel>
                      <DropdownMenuSeparator />
                    </>
                  )}
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => router.push("/account?tab=questions")}
                  >
                    My Questions
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => router.push("/account?tab=votes")}
                  >
                    My Votes
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    className="cursor-pointer"
                    onClick={() => router.push("/dashboard")}
                  >
                    Dashboard
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    variant="destructive"
                    className="cursor-pointer"
                    onClick={() => router.push("/auth/sign-out")}
                  >
                    Sign out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            ) : (
              /* Logged out / anonymous: sign in + politician CTA */
              <>
                <Link
                  href="/sign-in"
                  className="px-3 py-1.5 rounded-md text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                >
                  Sign in
                </Link>
                <Link
                  href="/verify"
                  className="inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Are you a politician?
                </Link>
              </>
            )}
          </div>
        )}
      </div>
    </nav>
  );
}
