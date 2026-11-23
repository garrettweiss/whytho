import Link from "next/link";

export function LegalFooter() {
  return (
    <footer className="border-t border-[#54565c] bg-[#151619] text-[#f9f9f6]">
      <nav aria-label="Legal and support" className="mx-auto flex max-w-7xl flex-wrap gap-x-6 px-4 pb-20 pt-4 text-sm sm:px-8">
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/privacy">Privacy notice</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/terms">Terms of use</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/report">Report a problem</Link>
        <Link className="inline-flex min-h-11 items-center underline underline-offset-4" href="/report#intimate-images">Request intimate-image removal</Link>
      </nav>
    </footer>
  );
}
