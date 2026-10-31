import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { clientIp } from "@/lib/rate-limit";
import { durableRateLimit, rateLimitKey } from "@/lib/security/durable-rate-limit";

export async function POST(req: NextRequest) {
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if (user) return NextResponse.json({success:true});
  // Reserve the shared counter before creating an account, so concurrency and
  // function restarts cannot turn a failed read into unlimited session creation.
  const limit=await durableRateLimit(rateLimitKey("anon-session",clientIp(req)),10,3600);
  if (limit!=="allowed") return NextResponse.json({error:limit==="limited"?"Too many requests. Please try again later.":"Session creation is temporarily unavailable."},{status:limit==="limited"?429:503});
  const {data,error}=await supabase.auth.signInAnonymously();
  if (error || !data.user) return NextResponse.json({error:"Failed to create session."},{status:503});
  return NextResponse.json({success:true});
}
