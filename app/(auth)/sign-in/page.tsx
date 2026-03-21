import { SignInForm } from "@/components/auth/sign-in-form";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign In | WhyTho",
};

export default function SignInPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-6">
      <div className="w-full max-w-sm space-y-6">
        <div className="space-y-2 text-center">
          <h1 className="text-3xl font-bold tracking-tight">WhyTho</h1>
          <p className="text-sm text-muted-foreground">
            Hold your representatives accountable.
          </p>
        </div>
        <SignInForm />
      </div>
    </main>
  );
}
