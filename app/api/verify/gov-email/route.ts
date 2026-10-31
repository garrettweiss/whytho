import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { randomInt } from "node:crypto";
import { getResend, FROM_EMAIL } from "@/lib/email/resend";
import { durableRateLimit, rateLimitKey } from "@/lib/security/durable-rate-limit";
import { permittedGovernmentEmail, reviewedSource } from "@/lib/security/verification";
import { z } from "zod";

const schema=z.discriminatedUnion("action",[
  z.object({action:z.literal("request"),politician_id:z.string().uuid(),email:z.string().email().max(254)}),
  z.object({action:z.literal("confirm"),politician_id:z.string().uuid(),code:z.string().regex(/^\d{6}$/)}),
]);

export async function POST(request: NextRequest) {
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({error:"Invalid verification request."},{status:400});
  const body=parsed.data;
  const supabase=await createClient();
  const {data:{user}}=await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({error:"Authentication required"},{status:401});
  const admin=createAdminClient();
  const membership=await admin.from("politician_team").select("role").eq("politician_id",body.politician_id).eq("user_id",user.id).maybeSingle();
  if (membership.error) return NextResponse.json({error:"Verification is temporarily unavailable."},{status:503});
  if (membership.data?.role!=="admin") return NextResponse.json({error:"Only the profile admin can verify this profile."},{status:403});
  const source=await reviewedSource(body.politician_id);
  if (!source) return NextResponse.json({error:"The official verification sources for this profile need review by WhyTho. Contact support before continuing."},{status:422});

  if (body.action==="request") {
    const email=body.email.toLowerCase().trim();
    if (!permittedGovernmentEmail(email,source.government_email_domains)) return NextResponse.json({error:"Use the government email domain approved for this office. Contact WhyTho if it needs review."},{status:422});
    const limit=await durableRateLimit(rateLimitKey("gov-email-send",user.id),3,3600);
    if (limit!=="allowed") return NextResponse.json({error:limit==="limited"?"Please wait before requesting another code.":"Verification is temporarily unavailable."},{status:limit==="limited"?429:503});
    const code=randomInt(100000,1000000).toString();
    const expires=new Date(Date.now()+30*60*1000).toISOString();
    const result=await admin.from("politician_verifications").insert({politician_id:body.politician_id,user_id:user.id,method:"gov_email",status:"pending",verification_code:code,code_expires_at:expires,metadata:{email,assurance:"reviewed_source_v1",source_url:source.evidence_url}});
    if (result.error) return NextResponse.json({error:"Unable to create verification."},{status:503});
    try {
      const sent=await getResend().emails.send({from:FROM_EMAIL,to:email,subject:"Your WhyTho verification code",text:`Your WhyTho verification code is ${code}. It expires in 30 minutes. Do not share it. If you did not request this code, ignore this message.`});
      if (sent.error) return NextResponse.json({error:"The verification email could not be delivered. Please try again later."},{status:503});
    } catch { return NextResponse.json({error:"The verification email could not be delivered. Please try again later."},{status:503}); }
    return NextResponse.json({success:true,message:"Verification code sent. It expires in 30 minutes."});
  }
  const result=await admin.from("politician_verifications").select("id,status,verification_code,code_expires_at,metadata").eq("politician_id",body.politician_id).eq("user_id",user.id).eq("method","gov_email").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (result.error) return NextResponse.json({error:"Verification is temporarily unavailable."},{status:503});
  const verification=result.data;
  if (!verification) return NextResponse.json({error:"Request a verification code first."},{status:404});
  const metadata=verification.metadata as {email?: string;assurance?:string;source_url?:string} | null;
  if (metadata?.assurance!=="reviewed_source_v1" || metadata.source_url!==source.evidence_url || !metadata.email || !permittedGovernmentEmail(metadata.email,source.government_email_domains)) return NextResponse.json({error:"Request a new code using the approved office email."},{status:422});
  if (verification.status==="completed") return NextResponse.json({success:true,already_verified:true});
  if (verification.status!=="pending" || !verification.code_expires_at || new Date(verification.code_expires_at).getTime()<=Date.now()) return NextResponse.json({error:"Code expired. Request a new code."},{status:422});
  const limit=await durableRateLimit(rateLimitKey("gov-email-attempt",verification.id),5,86400);
  if (limit!=="allowed") return NextResponse.json({error:limit==="limited"?"Too many attempts. Request a new code.":"Verification is temporarily unavailable."},{status:limit==="limited"?429:503});
  if (verification.verification_code!==body.code) return NextResponse.json({error:"Incorrect verification code."},{status:422});
  const completed=await admin.from("politician_verifications").update({status:"completed",verified_at:new Date().toISOString(),verification_code:null,code_expires_at:null}).eq("id",verification.id).eq("status","pending").eq("verification_code",body.code).gt("code_expires_at",new Date().toISOString()).select("id").maybeSingle();
  if (completed.error || !completed.data) return NextResponse.json({error:"Verification changed. Please reload and try again."},{status:409});
  return NextResponse.json({success:true,method:"gov_email",message:"Government email verified successfully."});
}
