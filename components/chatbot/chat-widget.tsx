"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import { MessageCircleQuestion } from "lucide-react";
import { ChatPanel } from "./chat-panel";
import { faceBody } from "@/components/home/fonts";
import styles from "./chat-widget.module.css";

/**
 * Floating chatbot widget, fixed bottom-right on every page.
 * Reads the current URL to build page context for the assistant.
 */
export function ChatWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const trigger = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const close = () => { setIsOpen(false); requestAnimationFrame(() => trigger.current?.focus()); };
  useEffect(() => {
    if (isOpen) panel.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
  }, [isOpen]);

  // Build page context from URL
  const pageContext = buildPageContext(pathname);

  return (
    <div className={`${styles.theme} ${faceBody.variable}`}>
      {/* Panel */}
      {isOpen && (
        <div
          ref={panel}
          id="whytho-assistant"
          className={styles.panel}
          onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); close(); } }}
          role="dialog"
          aria-label="WhyTho Assistant"
        >
          <ChatPanel pageContext={pageContext} onClose={close} />
        </div>
      )}

      {/* Trigger button */}
      <button
        ref={trigger}
        onClick={() => isOpen ? close() : setIsOpen(true)}
        className={styles.trigger}
        aria-expanded={isOpen}
        aria-controls={isOpen ? "whytho-assistant" : undefined}
        aria-label={isOpen ? "Close assistant" : "Open WhyTho Assistant"}
      >
        <MessageCircleQuestion size={18} />
        <span className="text-sm font-medium">{isOpen ? "Close" : "Ask WhyTho"}</span>
      </button>
    </div>
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

  const informationPages: Record<string, string> = {
    "/about": "the About WhyTho page", "/faq": "the WhyTho FAQ page",
    "/how-it-works": "the How WhyTho works page", "/account": "the account settings and activity page",
    "/races": "the election directory", "/sign-in": "the WhyTho sign-in page",
    "/settings/notifications": "the notification preferences page",
  };
  if (informationPages[pathname]) return informationPages[pathname];
  if (pathname.startsWith("/races/")) return "an election record page";
  if (pathname.startsWith("/admin") || pathname.startsWith("/auth") || pathname.startsWith("/settings")) return "a WhyTho account management page";
  const slugMatch = pathname.match(/^\/([a-z0-9-]+)$/);
  if (slugMatch) return `the public politician profile with slug ${slugMatch[1]}`;

  return null;
}
