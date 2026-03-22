"use client";

import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

/**
 * Sign-in form with anonymous → real account upgrade support.
 *
 * If the current visitor already has an anonymous session (created silently
 * when they voted), we use linkIdentity() / updateUser() to UPGRADE that
 * session rather than creating a new account. This preserves their vote
 * history and prevents re-voting on the same questions (the UNIQUE constraint
 * on votes remains intact since user_id doesn't change).
 *
 * Security notes:
 * - linkIdentity() conflict (Google account already exists) → fall back to
 *   regular sign-in with a clear message. Anonymous votes are not preserved
 *   in this case, but the user gets into their existing account.
 * - Email already registered → same "check your inbox" message to prevent
 *   enumeration. Supabase sends appropriate email either way.
 * - After upgrade, user_id is unchanged. UNIQUE(user_id, question_id,
 *   week_number) prevents double-voting.
 */

export function SignInForm({ redirectAfter = "/" }: { redirectAfter?: string }) {
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [emailSent, setEmailSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Detect if visitor already has an anonymous session
  useEffect(() => {
    const supabase = createClient();
    supabase.auth.getUser().then(({ data: { user } }) => {
      setIsAnonymous(!!user?.is_anonymous);
    });
  }, []);

  // ── Google ────────────────────────────────────────────────────────────────

  async function handleGoogleSignIn() {
    setLoading(true);
    setError(null);
    setInfo(null);
    const supabase = createClient();
    const next = redirectAfter !== "/" ? `?next=${encodeURIComponent(redirectAfter)}` : "";
    const redirectTo = `${window.location.origin}/auth/callback${next}`;

    if (isAnonymous) {
      // Upgrade path: link Google identity to the existing anonymous account.
      // Same user_id → all votes preserved, can't re-vote (UNIQUE constraint).
      const { error: linkError } = await supabase.auth.linkIdentity({
        provider: "google",
        options: { redirectTo },
      });

      if (!linkError) {
        // linkIdentity redirects the browser — nothing more to do here
        return;
      }

      // Conflict: this Google account is already tied to another WhyTho user.
      // Fall back to regular sign-in. Anonymous votes won't be merged but the
      // user gets into their existing account.
      if (
        linkError.message.toLowerCase().includes("already") ||
        linkError.message.toLowerCase().includes("conflict") ||
        linkError.status === 422
      ) {
        setInfo(
          "This Google account is already linked to a WhyTho account. Signing you in now…"
        );
        // Brief pause so user sees the message
        await new Promise((r) => setTimeout(r, 1500));
      }
    }

    // Standard sign-in (non-anonymous, or conflict fallback)
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });

    if (oauthError) {
      setError("Google sign-in failed. Please try again.");
      setLoading(false);
    }
    // On success the browser redirects — no need to setLoading(false)
  }

  // ── Email / Magic link ────────────────────────────────────────────────────

  async function handleMagicLink(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setInfo(null);

    const formData = new FormData(e.currentTarget);
    const email = formData.get("email") as string;
    if (!email) {
      setError("Email is required");
      setLoading(false);
      return;
    }

    const supabase = createClient();
    const next = redirectAfter !== "/" ? `?next=${encodeURIComponent(redirectAfter)}` : "";
    const callbackUrl = `${window.location.origin}/auth/callback${next}`;

    if (isAnonymous) {
      // Upgrade path: link email to the existing anonymous account.
      // supabase.auth.updateUser sends a confirmation email. On click the
      // anonymous account gets the email attached (user_id unchanged).
      const { error: updateError } = await supabase.auth.updateUser(
        { email },
        { emailRedirectTo: callbackUrl }
      );

      if (!updateError || updateError.message.toLowerCase().includes("already registered")) {
        // Show same message regardless of whether email was free or taken.
        // If free: confirmation email sent → clicking it upgrades the account.
        // If taken: Supabase sends a sign-in link to the existing account.
        // Either way: "check your inbox" is correct and prevents enumeration.
        setEmailSent(true);
        setLoading(false);
        return;
      }

      // Unexpected error — fall through to standard magic link
    }

    // Standard magic link (non-anonymous, or fallback)
    const { error: otpError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: callbackUrl,
      },
    });

    if (otpError) {
      setError("Failed to send sign-in link. Please try again.");
    } else {
      setEmailSent(true);
    }
    setLoading(false);
  }

  // ── Render ────────────────────────────────────────────────────────────────

  if (emailSent) {
    return (
      <div className="rounded-lg border bg-card p-6 text-center space-y-2">
        <p className="font-medium">Check your email</p>
        <p className="text-sm text-muted-foreground">
          We sent you a link. Click it to{" "}
          {isAnonymous ? "finish setting up your account" : "sign in"}.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Context banner for anonymous upgrade */}
      {isAnonymous && (
        <div className="rounded-md border border-blue-200 bg-blue-50 dark:border-blue-800 dark:bg-blue-950/30 px-3 py-2">
          <p className="text-xs text-blue-800 dark:text-blue-300">
            Your votes are saved. Create an account to submit questions and
            keep your history permanently.
          </p>
        </div>
      )}

      {info && (
        <p className="text-sm text-muted-foreground text-center">{info}</p>
      )}

      {/* Google */}
      <Button
        type="button"
        variant="outline"
        className="w-full"
        onClick={handleGoogleSignIn}
        disabled={loading}
      >
        <svg className="mr-2 h-4 w-4" viewBox="0 0 24 24" aria-hidden="true">
          <path
            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            fill="#4285F4"
          />
          <path
            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            fill="#34A853"
          />
          <path
            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            fill="#FBBC05"
          />
          <path
            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            fill="#EA4335"
          />
        </svg>
        {isAnonymous ? "Continue with Google" : "Continue with Google"}
      </Button>

      <div className="relative">
        <div className="absolute inset-0 flex items-center">
          <span className="w-full border-t" />
        </div>
        <div className="relative flex justify-center text-xs uppercase">
          <span className="bg-background px-2 text-muted-foreground">or</span>
        </div>
      </div>

      {/* Magic link */}
      <form onSubmit={handleMagicLink} className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="email">Email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            placeholder="you@example.com"
            required
            disabled={loading}
          />
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={loading}>
          {loading
            ? "Sending…"
            : isAnonymous
            ? "Continue with email"
            : "Send magic link"}
        </Button>
      </form>

      <p className="text-center text-xs text-muted-foreground">
        {isAnonymous
          ? "Your existing votes will be saved to your new account."
          : "Anonymous users can vote. Create an account to submit questions."}
      </p>
    </div>
  );
}
