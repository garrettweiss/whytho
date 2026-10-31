import { lookup } from "node:dns/promises";
import { request as httpsRequest } from "node:https";
import type { ClientRequest, IncomingMessage } from "node:http";
import { isPublicIpv4, safeOfficialUrl, readVerificationCode } from "./public-url";
export { isPublicIpv4, safeOfficialUrl, permittedGovernmentEmail } from "./public-url";
import { createAdminClient } from "@/lib/supabase/server";

export type VerificationSource = { official_website_url: string; government_email_domains: string[]; evidence_url: string };

export async function reviewedSource(politicianId: string): Promise<VerificationSource | null> {
  const admin=createAdminClient();
  const from = admin.from.bind(admin) as unknown as (name: string) => { select(columns: string): { eq(column: string,value: string): { maybeSingle(): Promise<{data: VerificationSource | null;error: unknown}> } } };
  const result=await from("politician_verification_sources").select("official_website_url,government_email_domains,evidence_url").eq("politician_id",politicianId).maybeSingle();
  if (result.error || !result.data || !safeOfficialUrl(result.data.official_website_url)) return null;
  return result.data;
}

/** One eight-second budget includes DNS, connection setup and the entire body. */
export async function fetchOfficialMetaTag(raw: string): Promise<string | null> {
  const url=safeOfficialUrl(raw);
  if (!url) return null;
  return new Promise<string | null>((resolve)=>{
    let settled=false;
    let req: ClientRequest | undefined;
    let response: IncomingMessage | undefined;
    const finish=(html: string | null)=>{
      if (settled) return;
      settled=true;
      clearTimeout(deadline);
      response?.destroy();
      req?.destroy();
      resolve(html ? readVerificationCode(html) : null);
    };
    // Socket inactivity timeouts alone allow a slow trickle to run indefinitely.
    const deadline=setTimeout(()=>finish(null),8000);
    void lookup(url.hostname,{family:4,all:true}).then(addresses=>{
      // OS DNS lookup cannot be cancelled; a late result must not open a socket.
      if (settled) return;
      if (!addresses.length || addresses.some(({address})=>!isPublicIpv4(address))) {finish(null);return;}
      const address=addresses[0]!.address;
      req=httpsRequest(url,{
        method:"GET",timeout:8000,family:4,...{autoSelectFamily:false},
        headers:{"User-Agent":"WhyThoBot/1.0 (+https://whytho.us/verify)",Accept:"text/html"},
        lookup: (_hostname,_options,callback)=>callback(null,address,4),
      },res=>{
        response=res;
        if (settled) {res.destroy();return;}
        // Redirects are rejected, so they never reset or extend the deadline.
        if (res.statusCode!==200 || !res.headers["content-type"]?.toLowerCase().startsWith("text/html")) {finish(null);return;}
        let size=0;const chunks: Buffer[]=[];
        res.on("data",(chunk: Buffer)=>{
          if (settled) return;
          size+=chunk.length;
          if (size>50_000) {finish(null);return;}
          chunks.push(chunk);
          const html=Buffer.concat(chunks).toString("utf8");
          if (html.toLowerCase().includes("</head>")) finish(html);
        });
        res.on("end",()=>finish(Buffer.concat(chunks).toString("utf8")));
        res.on("error",()=>finish(null));
        res.on("aborted",()=>finish(null));
      });
      req.on("timeout",()=>finish(null));
      req.on("error",()=>finish(null));req.end();
    }).catch(()=>finish(null));
  });
}
