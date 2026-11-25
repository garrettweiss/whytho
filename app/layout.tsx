import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { SiteNav } from "@/components/ui/site-nav";
import { PostHogProvider } from "@/components/analytics/posthog-provider";
import { ChatWidget } from "@/components/chatbot/chat-widget";
import { ParticipationBanner } from "@/components/auth/participation-banner";
import { ParticipationProvider } from "@/components/auth/participation-provider";
import { LegalFooter } from "@/components/legal/legal-footer";
import { THEME_STORAGE_KEY } from "@/lib/theme";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const restoreTheme = `try {
  if (localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)}) === "light") {
    document.documentElement.classList.remove("dark");
  }
} catch {}`;

export const metadata: Metadata = {
  title: "WhyTho: Ask Your Representatives",
  description:
    "The civic accountability platform where silence is its own answer. Submit and upvote questions for US politicians. Their response rate is always public.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: restoreTheme }} />
      </head>
      <body className={`${geistSans.variable} ${geistMono.variable} antialiased`}>
        <PostHogProvider>
          <ParticipationProvider>
            <SiteNav />
            <ParticipationBanner />
            {children}
            <LegalFooter />
            <ChatWidget />
          </ParticipationProvider>
        </PostHogProvider>
      </body>
    </html>
  );
}
