import { SignInForm } from "@/components/auth/sign-in-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | WhyTho",
};

interface Props {
  searchParams: Promise<{ redirect?: string }>;
}

/** Returns true if the redirect target is a safe relative path */
function isSafeRedirect(path: string | undefined): path is string {
  return (
    typeof path === "string" &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.startsWith("/\\")
  );
}

export default async function SignInPage({ searchParams }: Props) {
  const { redirect } = await searchParams;
  const redirectAfter = isSafeRedirect(redirect) ? redirect : "/";

  // Detect politician context: coming from /verify or /dashboard
  const isPoliticianContext =
    redirectAfter.startsWith("/verify") || redirectAfter.startsWith("/dashboard");

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">WhyTho</h1>
          <p className="text-sm text-muted-foreground">
            {isPoliticianContext
              ? "Sign in to claim your profile and respond to constituent questions."
              : "Hold your representatives accountable."}
          </p>
        </div>
        <SignInForm redirectAfter={redirectAfter} />
      </div>
    </main>
  );
}
