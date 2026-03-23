"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useUser } from "@/lib/auth/use-user";
import { useIsPolitician } from "@/lib/auth/use-is-politician";
import { useViewMode } from "@/lib/auth/use-view-mode";
import { SearchBar } from "@/components/search/search-bar";

const RIGHT_NAV_LINKS = [
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/races", label: "Elections" },
];

export function SiteNav() {
  const pathname = usePathname();
  const router = useRouter();
  const { user, isLoading } = useUser();

  const [menuOpen, setMenuOpen] = useState(false);
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  const isHome = pathname === "/";
  const isActive = (href: string) => pathname.startsWith(href);

  const isLoggedIn = user && !user.is_anonymous;
  const avatarInitial = user?.email?.[0]?.toUpperCase() ?? "U";
  const isPolitician = useIsPolitician(isLoggedIn ? user : null);
  const { mode, toggle, ready: modeReady } = useViewMode(isPolitician);
  const inPoliticianMode = isPolitician && modeReady && mode === "politician";

  // Close dropdown on outside click
  useEffect(() => {
    if (!menuOpen) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [menuOpen]);

  // Close on route change
  useEffect(() => {
    setMenuOpen(false);
    setMobileSearchOpen(false);
  }, [pathname]);

  function navigate(href: string) {
    setMenuOpen(false);
    router.push(href);
  }

  return (
    <nav
      aria-label="Main navigation"
      className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 sticky top-0 z-40"
    >
      <div className="mx-auto max-w-5xl px-4 h-14 flex items-center gap-3">

        {/* Logo */}
        <Link
          href="/"
          aria-label="WhyTho home"
          className="font-bold text-sm tracking-tight hover:text-muted-foreground transition-colors shrink-0"
        >
          WhyTho
        </Link>

        {/* Search — hidden on home (hero IS the search), hidden on mobile */}
        {!isHome && (
          <div className="hidden md:flex flex-1 max-w-sm">
            <SearchBar />
          </div>
        )}

        {/* Spacer when on home or mobile — pushes right nav to edge */}
        <div className="flex-1" />

        {/* Right nav links — hidden on mobile */}
        <div className="hidden md:flex items-center gap-1" role="list">
          {RIGHT_NAV_LINKS.map((link) => {
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

        {/* Mobile search icon (not shown on home — hero handles it) */}
        {!isHome && (
          <button
            className="md:hidden p-2 text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open search"
            onClick={() => setMobileSearchOpen((o) => !o)}
          >
            <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor" aria-hidden>
              <path fillRule="evenodd" d="M8 4a4 4 0 100 8 4 4 0 000-8zM2 8a6 6 0 1110.89 3.476l4.817 4.817a1 1 0 01-1.414 1.414l-4.816-4.816A6 6 0 012 8z" clipRule="evenodd" />
            </svg>
          </button>
        )}

        {/* Auth area */}
        {!isLoading && (
          <div className="flex items-center gap-2 shrink-0">
            {isLoggedIn ? (
              /* Logged-in: avatar + custom dropdown */
              <div ref={menuRef} className="relative">
                <button
                  aria-label="Account menu"
                  aria-expanded={menuOpen}
                  aria-haspopup="menu"
                  onClick={() => setMenuOpen((o) => !o)}
                  className={`flex h-8 w-8 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold hover:opacity-90 transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring cursor-pointer ${inPoliticianMode ? "ring-2 ring-red-500 ring-offset-1 ring-offset-background" : ""}`}
                >
                  {avatarInitial}
                </button>

                {menuOpen && (
                  <div
                    role="menu"
                    className="absolute right-0 top-10 z-50 w-52 rounded-lg border bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10 py-1"
                  >
                    {user?.email && (
                      <>
                        <div className="px-3 py-2 text-xs text-muted-foreground truncate">
                          {user.email}
                        </div>
                        <div className="my-1 h-px bg-border -mx-0" />
                      </>
                    )}
                    <button
                      role="menuitem"
                      onClick={() => navigate("/account?tab=questions")}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      My Questions
                    </button>
                    <button
                      role="menuitem"
                      onClick={() => navigate("/account?tab=votes")}
                      className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                    >
                      My Votes
                    </button>
                    {inPoliticianMode && (
                      <button
                        role="menuitem"
                        onClick={() => navigate("/dashboard")}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        Dashboard
                      </button>
                    )}
                    {!isPolitician && (
                      <button
                        role="menuitem"
                        onClick={() => navigate("/verify")}
                        className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors"
                      >
                        Claim your profile
                      </button>
                    )}
                    {isPolitician && modeReady && (
                      <>
                        <div className="my-1 h-px bg-border" />
                        <button
                          role="menuitem"
                          onClick={() => { toggle(); setMenuOpen(false); }}
                          className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent hover:text-accent-foreground transition-colors flex items-center justify-between gap-2"
                        >
                          <span>{mode === "politician" ? "Switch to Citizen View" : "Switch to Politician Mode"}</span>
                          <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${mode === "politician" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" : "bg-muted text-muted-foreground"}`}>
                            {mode === "politician" ? "Politician" : "Citizen"}
                          </span>
                        </button>
                      </>
                    )}
                    <div className="my-1 h-px bg-border" />
                    <button
                      role="menuitem"
                      onClick={() => navigate("/auth/sign-out")}
                      className="w-full text-left px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 transition-colors"
                    >
                      Sign out
                    </button>
                  </div>
                )}
              </div>
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
                  className="hidden sm:inline-flex items-center justify-center rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
                >
                  Are you a politician?
                </Link>
              </>
            )}
          </div>
        )}
      </div>

      {/* Mobile search bar — slides in below nav when icon clicked */}
      {mobileSearchOpen && !isHome && (
        <div className="md:hidden border-t px-4 py-2">
          <SearchBar placeholder="Search politicians, states..." />
        </div>
      )}
    </nav>
  );
}
