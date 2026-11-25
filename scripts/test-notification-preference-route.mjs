// Executes the real route with a synthetic session/RPC boundary. No network.
import assert from 'node:assert/strict';
import { mkdtemp,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
const runtime=resolve(process.argv[2]);
const require=createRequire(join(runtime,'package.json'));
const {build}=require('esbuild');
const scratch=await mkdtemp(join(tmpdir(),'whytho-notification-route.'));
const stateKey='__whythoNotificationPreferenceTest';
globalThis[stateKey]={user:{id:'00000000-0000-4000-8000-000000000001',is_anonymous:false},calls:[],error:null};
const state=globalThis[stateKey];
await build({entryPoints:[resolve('app/api/settings/office-notifications/route.ts')],outfile:join(scratch,'route.mjs'),bundle:true,format:'esm',platform:'node',tsconfig:resolve('tsconfig.json'),plugins:[{
 name:'synthetic-route-boundaries',setup(b){
 b.onResolve({filter:/^next\/server$/},()=>({path:'next',namespace:'fixture'}));
 b.onResolve({filter:/supabase\/server$/},()=>({path:'supabase',namespace:'fixture'}));
 b.onLoad({filter:/.*/,namespace:'fixture'},args=>({contents:args.path==='next'
  ? 'export class NextResponse extends Response { static json(body,init){return new Response(JSON.stringify(body),{...init,headers:{"Content-Type":"application/json",...init?.headers}})} }'
  : `const s=globalThis[${JSON.stringify(stateKey)}]; export async function createClient(){return {auth:{getUser:async()=>({data:{user:s.user}})}}}; export function createAdminClient(){return {rpc:async(name,args)=>{s.calls.push({name,args}); return s.error?{data:null,error:s.error}:{data:name.startsWith('get_')?[]:{mode:args.p_mode,timezone:args.p_timezone},error:null}}}};` }));
 }}]});
const route=await import(pathToFileURL(join(scratch,'route.mjs')).href);
const politician_id='10000000-0000-4000-8000-000000000001';
let result=await route.GET();
assert.equal(result.status,200);assert.equal(result.headers.get('cache-control'),'private, no-store');assert.deepEqual(await result.json(),{preferences:[],sending_enabled:false});
const request=body=>new Request('https://whytho.us/api/settings/office-notifications',{method:'PATCH',headers:{'Content-Type':'application/json',Origin:'https://whytho.us'},body:JSON.stringify(body)});
result=await route.PATCH(request({politician_id,mode:'daily',timezone:'America/New_York',consent_version:'politician-question-notices-v1'}));
assert.equal(result.status,200);assert.equal((await result.json()).sending_enabled,false);
assert.deepEqual(state.calls.at(-1).args,{p_actor_id:state.user.id,p_politician_id:politician_id,p_mode:'daily',p_timezone:'America/New_York',p_consent_version:'politician-question-notices-v1'});
result=await route.PATCH(request({politician_id,mode:'off'}));assert.equal(result.status,200);assert.equal(state.calls.at(-1).args.p_mode,'off');
state.error={code:'503',message:'private diagnostic detail'};
result=await route.GET();assert.equal(result.status,503);assert.equal(JSON.stringify(await result.json()).includes('private diagnostic detail'),false);
state.error=null;state.user=null;result=await route.GET();assert.equal(result.status,401);
const report={passed:5,scope:'Real route, synthetic auth/RPC and NextResponse boundaries; SQL suite tests actual persistence and membership',checks:['load self preferences/no-store/sending off','daily save binds authenticated actor','off without renewed consent','database read failure remains failure with sanitized response','signed-out settings require sign-in']};
await writeFile(join(scratch,'result.json'),JSON.stringify(report,null,2));
console.log(JSON.stringify({...report,evidence:scratch},null,2));
