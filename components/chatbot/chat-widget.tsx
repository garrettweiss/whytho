"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import { ChatPanel } from "./chat-panel";

/**
 * Floating chatbot widget, fixed bottom-right on every page.
 * Reads the current URL to build page context for the assistant.
 */
export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();

  // Build page context from URL
  const pageContext = buildPageContext(pathname);

  return (
    <>
      {/* Panel */}
      {isOpen && (
        <div
          className="fixed bottom-20 right-4 z-50 w-[360px] max-w-[calc(100vw-2rem)] h-[520px] max-h-[calc(100vh-6rem)] rounded-2xl border bg-background shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-4 fade-in duration-200"
          role="dialog"
          aria-label="WhyTho Assistant"
        >
          <ChatPanel pageContext={pageContext} onClose={() => setIsOpen(false)} />
        </div>
      )}

      {/* Trigger button */}
      <button
        onClick={() => setIsOpen((v) => !v)}
        className={`
          fixed bottom-4 right-4 z-50
          flex items-center gap-2
          h-12 rounded-full shadow-lg
          bg-primary text-primary-foreground
          transition-all duration-200
          hover:opacity-90 active:scale-95
          ${isOpen ? "px-4" : "px-4"}
        `}
        aria-label={isOpen ? "Close assistant" : "Open WhyTho Assistant"}
      >
        <MessageCircleQuestion size={18} />
        <span className="text-sm font-medium">{isOpen ? "Close" : "Ask WhyTho"}</span>
      </button>
    </>
  );
}

function buildPageContext(pathname: string): string | null {
  if (pathname === "/" || pathname === "") return null;

  if (pathname === "/leaderboard") return "the WhyTho leaderboard page showing politician response rates";
  if (pathname === "/federal") return "the federal politicians directory";
  if (pathname.startsWith("/state/")) {
    const code = pathname.split("/")[2];
    return `the state legislature page for ${code?.toUpperCase() ?? "a US state"}`;
  }
  if (pathname.startsWith("/region/")) {
    const state = pathname.split("/")[2];
    return `the regional politicians page for ${state?.toUpperCase() ?? "a US state"}`;
  }
  if (pathname === "/verify") return "the politician verification page";
  if (pathname === "/dashboard") return "the politician dashboard";

  // Politician profile page (slug)
  const slugMatch = pathname.match(/^\/([a-z0-9-]+)$/);
  if (slugMatch) {
    const slug = slugMatch[1] ?? "";
    // Convert slug to readable name for context hint
    const name = slug
      .split("-")
      .slice(0, -1) // remove state suffix
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");
    return `the WhyTho profile page for ${name} (slug: ${slug})`;
  }

  return null;
}
