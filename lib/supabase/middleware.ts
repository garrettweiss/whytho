import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { isParticipationMutation, PARTICIPATION_REQUIRED } from "@/lib/auth/participation";
import type { Database } from "@/types/database";

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // Refresh session — must call getUser() to keep session alive
  const { data: { user } } = await supabase.auth.getUser();
  if (isParticipationMutation(request.nextUrl.pathname, request.method)) {
    if (!user || user.is_anonymous) return NextResponse.json({ error: "Sign in with an account to participate.", code: "ACCOUNT_REQUIRED" }, { status: 401 });
    const { data, error } = await supabase.rpc("has_current_participation_assent");
    if (error) return NextResponse.json({ error: "Participation verification is temporarily unavailable." }, { status: 503 });
    if (data !== true) return NextResponse.json({ error: PARTICIPATION_REQUIRED, code: "ASSENT_REQUIRED" }, { status: 403 });
  }

  return supabaseResponse;
}
