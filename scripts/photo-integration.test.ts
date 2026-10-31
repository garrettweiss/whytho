/** Executes real handlers with only session/DB/storage/cache boundaries replaced. No network. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import { resolve, dirname } from "node:path";
import ts from "typescript";
import sharp from "sharp";
const realRequire = createRequire(import.meta.url);
const person = "11111111-1111-4111-8111-111111111111";
const userId = "22222222-2222-4222-8222-222222222222";
type Options = { signedOut?: boolean; anonymous?: boolean; role?: string; tier?: string; rate?: string; rpcError?: string; uploadError?: boolean };
function fixture(opts: Options = {}) {
  const uploads: { path: string; bytes: Buffer; options: Record<string,unknown> }[] = [];
  const calls: { name:string; args:Record<string,unknown> }[] = [];
  const filters:Record<string,unknown>={};
  const cache:string[]=[];
  const admin = {
    from: () => {
      const query = {
        select() { return query; },
        eq(key:string,value:unknown) { filters[key]=value; return query; },
        async maybeSingle() { return { data: opts.role === "none" ? null : { role: opts.role ?? "admin", politicians: { verification_tier: opts.tier ?? "2" } }, error: null }; },
      }; return query;
    },
    storage: { from(bucket:string) { assert.equal(bucket,"politician-photos"); return {
      async upload(path:string,bytes:Buffer,options:Record<string,unknown>) { uploads.push({path,bytes,options}); return { error:opts.uploadError?{message:"offline"}:null }; },
      getPublicUrl(path:string) { return {data:{publicUrl:`https://example.supabase.co/storage/v1/object/public/politician-photos/${path}`}}; },
    }; } },
    async rpc(name:string,args:Record<string,unknown>) { calls.push({name,args}); return {data:opts.rpcError?null:"fixture-politician",error:opts.rpcError?{code:opts.rpcError}:null}; },
  };
  const modules: Record<string,unknown> = {
    "@/lib/supabase/server": { createClient:async()=>({auth:{getUser:async()=>({data:{user:opts.signedOut?null:{id:userId,is_anonymous:opts.anonymous??false}}})}}), createAdminClient:()=>admin },
    "@/lib/security/durable-rate-limit": { durableRateLimit:async()=>opts.rate??"allowed",rateLimitKey:()=>"fixture-key" },
    "next/cache": {revalidatePath:(path:string)=>cache.push(path),revalidateTag:(tag:string)=>cache.push(tag)},
  };
  const loaded = new Map<string,unknown>();
  function load(path:string): unknown {
    if(loaded.has(path))return loaded.get(path);
    const transformed=ts.transpileModule(readFileSync(path,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2020,esModuleInterop:true,jsx:ts.JsxEmit.ReactJSX}}).outputText;
    const loadedModule:{exports:unknown}={exports:{}};loaded.set(path,loadedModule.exports);
    const require = (name:string):unknown => {
      if(name in modules)return modules[name];
      if(name.startsWith("@/")||name.startsWith(".")){
        const file=name.startsWith("@/")?resolve(name.slice(2)):resolve(dirname(path),name);
        return load(`${file}.ts`);
      }
      return realRequire(name);
    };
    const fn=runInThisContext(`(function(require,module,exports){${transformed}\n})`,{filename:path}) as (r:typeof require,m:typeof loadedModule,e:unknown)=>void;
    fn(require,loadedModule,loadedModule.exports);loaded.set(path,loadedModule.exports);return loadedModule.exports;
  }
  const photo=load(resolve("app/api/dashboard/photo/route.ts")) as {POST:(request:Request)=>Promise<Response>};
  const profile=load(resolve("app/api/dashboard/profile/route.ts")) as {PATCH:(request:Request)=>Promise<Response>};
  return {photo,profile,uploads,calls,filters,cache};
}
async function uploadRequest(changes: { rights?:string; credit?:string; bytes?:Buffer }={}) {
  const bytes=changes.bytes??await sharp({create:{width:800,height:1000,channels:3,background:"white"}}).png().toBuffer();
  const form=new FormData();form.set("politician_id",person);form.set("rights_confirmed",changes.rights??"true");form.set("credit",changes.credit??"Fixture photographer");form.set("file",new Blob([new Uint8Array(bytes)],{type:"image/png"}),"portrait.png");
  return new Request("https://whytho.us/api/dashboard/photo",{method:"POST",body:form});
}
test("visitor and anonymous sessions cannot upload",async()=>{
  for(const opts of [{signedOut:true},{anonymous:true}]){const f=fixture(opts);assert.equal((await f.photo.POST(await uploadRequest())).status,401);assert.equal(f.uploads.length,0);}
});
test("ordinary user, editor, responder, removed member and self-claimed admin cannot upload",async()=>{
  for(const opts of [{role:"none"},{role:"editor"},{role:"responder"},{role:"admin",tier:"1"}]){const f=fixture(opts);assert.equal((await f.photo.POST(await uploadRequest())).status,403);assert.equal(f.uploads.length,0);assert.equal(f.filters.user_id,userId);assert.equal(f.filters.politician_id,person);}
});
test("rights refusal and missing credit block publication before upload",async()=>{
  for(const changes of [{rights:"false"},{credit:""}]){const f=fixture();assert.equal((await f.photo.POST(await uploadRequest(changes))).status,422);assert.equal(f.uploads.length,0);}
});
test("invalid bytes and quota failure leave storage untouched",async()=>{
  const f=fixture();assert.equal((await f.photo.POST(await uploadRequest({bytes:Buffer.from("bad image")}))).status,422);assert.equal(f.uploads.length,0);
  for(const [rate,status] of [["limited",429],["unavailable",503]] as const){const f=fixture({rate});assert.equal((await f.photo.POST(await uploadRequest())).status,status);assert.equal(f.uploads.length,0);}
});
test("storage failure and revoked-at-publication actor never report success",async()=>{
  const storage=fixture({uploadError:true});assert.equal((await storage.photo.POST(await uploadRequest())).status,503);assert.equal(storage.calls.length,0);
  const revoked=fixture({rpcError:"42501"});assert.equal((await revoked.photo.POST(await uploadRequest())).status,403);assert.equal(revoked.cache.length,0);assert.equal(revoked.calls[0]?.name,"replace_verified_portrait");
});
test("verified admin upload reencodes, versions, records permission and refreshes views",async()=>{
  const f=fixture();const response=await f.photo.POST(await uploadRequest());assert.equal(response.status,200);assert.equal((await response.json()).success,true);
  assert.match(f.uploads[0]!.path,new RegExp(`^${person}/[a-f0-9-]+\\.jpg$`));assert.equal(f.uploads[0]?.options.upsert,false);
  const metadata=await sharp(f.uploads[0]!.bytes).metadata();assert.equal(metadata.width,400);assert.equal(metadata.height,500);assert.equal(metadata.exif,undefined);
  assert.equal(f.calls[0]?.args.p_actor,userId);assert.equal(f.calls[0]?.args.p_rights_version,"whytho-portrait-permission-v1");assert.ok(f.cache.includes("/fixture-politician"));
});
test("profile rejects malformed or unsafe fields and uses the atomic verified-admin RPC",async()=>{
  const f=fixture();const req=(body:unknown)=>new Request("https://whytho.us/api/dashboard/profile",{method:"PATCH",headers:{"Content-Type":"application/json"},body:JSON.stringify(body)});
  assert.equal((await f.profile.PATCH(req({politician_id:person,website_url:"javascript:alert(1)"}))).status,422);assert.equal(f.calls.length,0);
  assert.equal((await f.profile.PATCH(req({politician_id:person,bio:"A public bio",social_handles:{instagram:""}}))).status,200);
  assert.equal(f.calls[0]?.name,"update_verified_profile");assert.equal(f.calls[0]?.args.p_actor,userId);
  const denied=fixture({rpcError:"42501"});assert.equal((await denied.profile.PATCH(req({politician_id:person,bio:"No permission"}))).status,403);
});
