import { NextRequest, NextResponse } from "next/server";
import { createClient, createAdminClient } from "@/lib/supabase/server";
import { randomBytes } from "node:crypto";
import { z } from "zod";
import { durableRateLimit, rateLimitKey } from "@/lib/security/durable-rate-limit";
import { fetchOfficialMetaTag, reviewedSource } from "@/lib/security/verification";

const schema=z.object({action:z.enum(["generate","check"]),politician_id:z.string().uuid()});
export async function POST(request: NextRequest) {
  const parsed=schema.safeParse(await request.json().catch(()=>null));
  if (!parsed.success) return NextResponse.json({error:"Invalid verification request."},{status:400});
  const body=parsed.data;
  const supabase=await createClient();const {data:{user}}=await supabase.auth.getUser();
  if (!user || user.is_anonymous) return NextResponse.json({error:"Authentication required"},{status:401});
  const admin=createAdminClient();
  const membership=await admin.from("politician_team").select("role").eq("politician_id",body.politician_id).eq("user_id",user.id).maybeSingle();
  if (membership.error) return NextResponse.json({error:"Verification is temporarily unavailable."},{status:503});
  if (membership.data?.role!=="admin") return NextResponse.json({error:"Only the profile admin can verify this profile."},{status:403});
  const source=await reviewedSource(body.politician_id);
  if (!source) return NextResponse.json({error:"WhyTho must review this profile's official website before verification. Contact support to continue."},{status:422});
  const limit=await durableRateLimit(rateLimitKey("meta-verification",user.id),10,3600);
  if (limit!=="allowed") return NextResponse.json({error:limit==="limited"?"Too many attempts. Please try later.":"Verification is temporarily unavailable."},{status:limit==="limited"?429:503});
  const result=await admin.from("politician_verifications").select("id,verification_code,status,metadata").eq("politician_id",body.politician_id).eq("user_id",user.id).eq("method","meta_tag").order("created_at",{ascending:false}).limit(1).maybeSingle();
  if (result.error) return NextResponse.json({error:"Verification is temporarily unavailable."},{status:503});
  const existing=result.data;
  const metadata=existing?.metadata as {website_url?:string;assurance?:string;source_url?:string} | null;
  const trusted=metadata?.assurance==="reviewed_source_v1" && metadata.website_url===source.official_website_url && metadata.source_url===source.evidence_url;
  if (trusted && existing?.status==="completed") return NextResponse.json({success:true,already_verified:true});
  if (body.action==="generate") {
    let code=trusted && existing?.status==="pending" ? existing.verification_code : null;
    if (!code) {
      code=`wt-${randomBytes(16).toString("hex")}`;
      const inserted=await admin.from("politician_verifications").insert({politician_id:body.politician_id,user_id:user.id,method:"meta_tag",status:"pending",verification_code:code,metadata:{assurance:"reviewed_source_v1",website_url:source.official_website_url,source_url:source.evidence_url}});
      if (inserted.error) return NextResponse.json({error:"Unable to create verification."},{status:503});
    }
    return NextResponse.json({success:true,code,website_url:source.official_website_url,instruction:`Add this tag to the head of ${source.official_website_url}:\n<meta name="whytho-verification" content="${code}">`});
  }
  if (!trusted || !existing || existing.status!=="pending" || !existing.verification_code) return NextResponse.json({error:"Generate a new verification code first."},{status:422});
  const found=await fetchOfficialMetaTag(source.official_website_url);
  if (!found || found!==existing.verification_code) return NextResponse.json({success:false,verified:false,error:"Verification tag not found on the reviewed official website. Redirects are not followed; contact support if the official URL changed."},{status:422});
  const completed=await admin.from("politician_verifications").update({status:"completed",verified_at:new Date().toISOString(),verification_code:null}).eq("id",existing.id).eq("status","pending").eq("verification_code",found).select("id").maybeSingle();
  if (completed.error || !completed.data) return NextResponse.json({error:"Verification changed. Please reload and try again."},{status:409});
  return NextResponse.json({success:true,verified:true,method:"meta_tag",message:"Official website ownership verified."});
}
