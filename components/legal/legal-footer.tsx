import Link from "next/link";
import { ThemeToggle } from "@/components/ui/theme-toggle";

export function LegalFooter() {
  return (
    <footer className="border-t border-[var(--editorial-rule)] bg-[var(--editorial-paper)] text-[var(--editorial-ink)]">
      <nav aria-label="Legal and support" className="mx-auto flex max-w-7xl flex-wrap gap-x-6 px-4 pb-4 pt-4 text-sm sm:px-8 min-[901px]:pb-20">
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/privacy">Privacy notice</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/terms">Terms of use</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/report">Report a problem</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/report#intimate-images">Request intimate-image removal</Link>
      </nav>
      <div className="mobile-theme-footer">
        <ThemeToggle placement="footer" />
      </div>
    </footer>
  );
}
