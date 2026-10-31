/**
 * Rights-reviewed portrait import. Dry-run by default; no name-only matching.
 * npx tsx scripts/photo-pipeline.ts --phase=4
 * npx tsx scripts/photo-pipeline.ts --rights-manifest=reviewed.json --dry-run
 * npx tsx scripts/photo-pipeline.ts --rights-manifest=reviewed.json --apply --limit=5
 * Every asset is versioned, bounded and conditionally published. Old objects remain.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "../types/database";
import { photoRightsManifest, type PhotoRights } from "../lib/photos/rights";
import { normalizeUploadedPortrait } from "../lib/photos/portrait";
import { downloadApprovedPhoto } from "../lib/photos/download";
try { process.loadEnvFile(".env.local"); } catch { /* environment may be injected */ }
const args=process.argv.slice(2);
const APPLY=args.includes("--apply")&&!args.includes("--dry-run");
const LIMIT=Math.max(1,Number(args.find(a=>a.startsWith("--limit="))?.split("=")[1]??Infinity));
const CONCURRENCY=Math.min(2,Math.max(1,Number(args.find(a=>a.startsWith("--concurrency="))?.split("=")[1]??2)));
const phases=args.find(a=>a.startsWith("--phase="))?.split("=")[1]?.split(",").map(Number)??[1,2,3,4];
const path=args.find(a=>a.startsWith("--rights-manifest="))?.slice("--rights-manifest=".length);
const rights=path?photoRightsManifest.parse(JSON.parse(readFileSync(path,"utf8"))):[];
const db=createClient<Database>(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY!,{auth:{persistSession:false,autoRefreshToken:false}});
const BUCKET="politician-photos";
type Person={id:string;full_name:string;photo_url:string|null;photo_source_url:string|null;office:string|null;is_test:boolean};
async function people():Promise<Person[]>{
  const rows:Person[]=[];
  for(let offset=0;;offset+=1000){const {data,error}=await db.from("politicians").select("id,full_name,photo_url,photo_source_url,office,is_test").order("id").range(offset,offset+999);if(error)throw new Error(error.message);rows.push(...data);if(data.length<1000)return rows;}
}
async function ensureBucket(){
  const {data,error}=await db.storage.getBucket(BUCKET);if(data)return;
  if(!APPLY){console.log("[preview] Would create portrait bucket if required.");return;}
  if(error&&!(error.message.toLowerCase().includes("not found")))throw new Error(error.message);
  const result=await db.storage.createBucket(BUCKET,{public:true,fileSizeLimit:4*1024*1024,allowedMimeTypes:["image/jpeg"]});if(result.error)throw new Error(result.error.message);
}
async function publish(p:Person,permission:PhotoRights){
  if(!APPLY){console.log(JSON.stringify({mode:"preview",politician_id:p.id,source:permission.source_url,license:permission.license,reviewer:permission.reviewed_by}));return;}
  const bytes=await normalizeUploadedPortrait(await downloadApprovedPhoto(permission.source_url));
  const objectPath=`${p.id}/${crypto.randomUUID()}.jpg`;
  const {error:uploadError}=await db.storage.from(BUCKET).upload(objectPath,bytes,{contentType:"image/jpeg",upsert:false,cacheControl:"31536000"});if(uploadError)throw new Error(uploadError.message);
  const url=db.storage.from(BUCKET).getPublicUrl(objectPath).data.publicUrl;
  let query=db.from("politicians").update({photo_url:url,photo_source_url:permission.source_url,photo_credit:permission.creator,photo_rights_basis:`${permission.license}: ${permission.license_url}; ${permission.source_page}; ${permission.changes}`}).eq("id",p.id);
  query=p.photo_url?query.eq("photo_url",p.photo_url):query.is("photo_url",null);
  const {data,error}=await query.select("id");if(error)throw new Error(error.message);
  console.log(JSON.stringify({politician_id:p.id,status:data.length?"published":"changed_since_preview",new_url:url,old_url:p.photo_url,license:permission.license,reviewer:permission.reviewed_by}));
}
async function main(){
  if(args.includes("--reprocess"))throw new Error("In-place reprocessing is paused. Use reviewed, versioned replacements to preserve originals.");
  if(APPLY&&!rights.length)throw new Error("--apply requires a reviewed --rights-manifest. A public source is not a reuse license.");
  const rows=await people();
  if(phases.includes(1))await ensureBucket();
  if(phases.includes(2)||phases.includes(3)){
    const plans=rights.flatMap(permission=>{
      const p=rows.find(person=>person.id===permission.politician_id&&!person.is_test);
      if(!p)throw new Error(`Manifest profile missing or test-only: ${permission.politician_id}`);
      if(p.photo_source_url===permission.source_url&&p.photo_url?.includes(`/storage/v1/object/public/${BUCKET}/`))return [];
      if((!p.photo_url&&!phases.includes(2))||(p.photo_url&&!phases.includes(3)))return [];
      return [{p,permission}];
    }).slice(0,LIMIT);
    console.log(`${APPLY?"Apply":"Preview"}: ${plans.length} reviewed replacements. Unreviewed discovery is excluded.`);
    for(let i=0;i<plans.length;i+=CONCURRENCY){const batch=await Promise.allSettled(plans.slice(i,i+CONCURRENCY).map(({p,permission})=>publish(p,permission)));for(const result of batch)if(result.status==="rejected"){process.exitCode=1;console.error(String(result.reason));}}
  }
  if(phases.includes(4)){const nonTest=rows.filter(p=>!p.is_test);console.log(JSON.stringify({scope:"pre-run inventory",total:nonTest.length,with_photo:nonTest.filter(p=>p.photo_url).length,with_source:nonTest.filter(p=>p.photo_source_url).length,rights_manifest_entries:rights.length}));}
}
main().catch(error=>{console.error(error instanceof Error?error.message:String(error));process.exitCode=1;});
