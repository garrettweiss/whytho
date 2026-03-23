import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const next = searchParams.get("next") ?? "/";

  if (code) {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      // Detect new user: created_at within last 30s
      const isNewUser =
        data.user?.created_at != null &&
        Date.now() - new Date(data.user.created_at).getTime() < 30_000;

      const redirectUrl = new URL(`${origin}${next}`);
      if (isNewUser) {
        redirectUrl.searchParams.set("new_user", "1");
      }

      return NextResponse.redirect(redirectUrl.toString());
    }
  }

  // Auth error — redirect to sign-in with error param
  return NextResponse.redirect(`${origin}/sign-in?error=auth_callback_failed`);
}
