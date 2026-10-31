/** Read-only: checks every recorded portrait, no DB/storage mutations or files downloaded. */
import { createClient } from "@supabase/supabase-js";
import { lookup } from "node:dns/promises";
import { request } from "node:https";
import { isIP } from "node:net";
import { appendFileSync, writeFileSync, mkdirSync, existsSync, readFileSync } from "node:fs";
import sharp from "sharp";

try { process.loadEnvFile(".env.local"); } catch { /* injected environment also supported */ }
const args = process.argv.slice(2);
const limit = Number(args.find(v => v.startsWith("--limit="))?.slice(8) ?? Infinity);
const concurrency = Math.min(6, Math.max(1, Number(args.find(v => v.startsWith("--concurrency="))?.split("=")[1] ?? 4)));
const out = args.find(v => v.startsWith("--output="))?.slice(9) ?? `docs/launch/evidence/portrait-audit-${Date.now()}`;
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!, { auth: { persistSession: false, autoRefreshToken: false } });
type Person = { id: string; slug: string; photo_url: string | null; photo_source_url: string | null; is_candidate: boolean; is_test: boolean; office: string | null };
function publicAddress(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a=0,b=0,c=0] = address.split(".").map(Number);
  return !(a===0||a===10||a===127||a>=224||(a===100&&b>=64&&b<=127)||(a===169&&b===254)||(a===172&&b>=16&&b<=31)||(a===192&&(b===168||b===0||b===88))||(a===198&&(b===18||b===19||(b===51&&c===100)))||(a===203&&b===0&&c===113));
}
async function imageBytes(raw: string, redirects=0): Promise<Buffer> {
  const url = new URL(raw.startsWith("//") ? `https:${raw}` : raw);
  if (url.protocol!=="https:"||url.port||url.username||url.password||isIP(url.hostname)||!url.hostname.includes(".")) throw new Error("unsafe_or_insecure_url");
  const addresses = await lookup(url.hostname, { family: 4, all: true });
  if (!addresses.length||addresses.some(v=>!publicAddress(v.address))) throw new Error("non_public_address");
  return new Promise((resolve,reject) => {
    let finished = false;
    const finish = (error?: Error, result?: Buffer) => { if (finished) return; finished=true; clearTimeout(timer); if(error) reject(error); else resolve(result!); };
    const req = request(url, { family: 4, ...{ autoSelectFamily: false }, timeout: 6000, headers: { "User-Agent": "WhyThoPortraitAudit/1.0 (+https://whytho.us)", Accept:"image/*" }, lookup:(_h,_o,callback)=>callback(null,addresses[0]!.address,4) }, res => {
      const code = res.statusCode ?? 0;
      if ([301,302,303,307,308].includes(code) && res.headers.location && redirects<3) {
        res.destroy(); clearTimeout(timer);
        imageBytes(new URL(res.headers.location,url).href,redirects+1).then(value=>finish(undefined,value),error=>finish(error)); return;
      }
      if (code!==200) { res.destroy(); finish(new Error(`http_${code}`)); return; }
      if (!res.headers["content-type"]?.startsWith("image/")) { res.destroy(); finish(new Error("not_image_content_type")); return; }
      const chunks:Buffer[]=[];let size=0;
      res.on("data",(chunk:Buffer)=>{size+=chunk.length;if(size>5*1024*1024){res.destroy();finish(new Error("over_5mb"));return;}chunks.push(chunk);});
      res.on("end",()=>finish(undefined,Buffer.concat(chunks)));
      res.on("error",()=>finish(new Error("download_error")));
    });
    const timer=setTimeout(()=>{req.destroy();finish(new Error("timeout"));},8000);
    req.on("timeout",()=>{req.destroy();finish(new Error("timeout"));});
    req.on("error",(error: NodeJS.ErrnoException)=>finish(new Error(`connection_${error.code ?? error.name}`)));req.end();
  });
}
async function main() {
  const rows:Person[]=[];
  for(let offset=0;;offset+=1000){
    const {data,error}=await db.from("politicians").select("id,slug,photo_url,photo_source_url,is_candidate,is_test,office").eq("is_active",true).order("id").range(offset,offset+999);
    if(error)throw new Error(error.message);rows.push(...data as Person[]);if(data.length<1000)break;
  }
  mkdirSync(out.slice(0,out.lastIndexOf("/")),{recursive:true});
  const selected=rows.filter(p=>p.photo_url&&!p.is_test).slice(0,limit);
  const counts:Record<string,number>={};let processed=0;
  const completed=new Set<string>();
  if(existsSync(`${out}.jsonl`)) {
    for(const line of readFileSync(`${out}.jsonl`,"utf8").split("\n").filter(Boolean)) {
      const row=JSON.parse(line) as {id:string;status:string};
      if(completed.has(row.id))continue;
      completed.add(row.id);counts[row.status]=(counts[row.status]??0)+1;processed++;
    }
  }
  const pending=selected.filter(p=>!completed.has(p.id));let cursor=0;
  async function worker() {
    while(cursor<pending.length) {
      const p=pending[cursor++];if(!p)break;
      let result:Record<string,unknown>={id:p.id,slug:p.slug,office:p.office,candidate:p.is_candidate,source_recorded:!!p.photo_source_url};
      try {
        const bytes=await imageBytes(p.photo_url!);const meta=await sharp(bytes,{limitInputPixels:40_000_000}).metadata();
        const w=meta.autoOrient?.width??meta.width??0;const h=meta.autoOrient?.height??meta.height??0;
        const status=w>=400&&h>=400?"usable_dimensions":w>=200&&h>=200?"small_portrait":"too_small";
        result={...result,status,width:w,height:h,bytes:bytes.length,format:meta.format};
      } catch(error) { result={...result,status:error instanceof Error?(error.message.split("\n")[0]??"failed").slice(0,80):"failed"}; }
      const status=String(result.status);counts[status]=(counts[status]??0)+1;
      appendFileSync(`${out}.jsonl`,JSON.stringify(result)+"\n");processed++;
      if(processed%100===0||processed===selected.length)console.log(JSON.stringify({processed,total:selected.length,counts}));
    }
  }
  await Promise.all(Array.from({length:concurrency},worker));
  const summary={checked_at:new Date().toISOString(),scope:"read-only live photo fetch and dimension audit; not likeness/rights certification",profiles:rows.length,non_test_profiles:rows.filter(p=>!p.is_test).length,with_photo:rows.filter(p=>p.photo_url&&!p.is_test).length,source_recorded:rows.filter(p=>p.photo_source_url).length,checked:processed,counts};
  writeFileSync(`${out}.json`,JSON.stringify(summary,null,2)+"\n");console.log(JSON.stringify(summary));
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
