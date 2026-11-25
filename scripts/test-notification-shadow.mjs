// Retained synthetic cluster. No credentials, network, production or provider calls.
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp,readFile,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
const pg=process.env.PG_BIN||'/opt/homebrew/opt/postgresql@17/bin';
const runtime=resolve(process.argv[2]);
const {build}=createRequire(join(runtime,'package.json'))('esbuild');
const root=await mkdtemp(join(tmpdir(),'whytho-shadow-local.'));
await build({entryPoints:[resolve('lib/notifications/shadow.ts')],outfile:join(root,'shadow.mjs'),bundle:true,format:'esm',platform:'node'});
const {projectShadow}=await import(pathToFileURL(join(root,'shadow.mjs')).href);
const run=(command,args)=>execFileSync(command,args,{encoding:'utf8',maxBuffer:4*1024*1024});
run(join(pg,'initdb'),['-D',join(root,'data'),'-U','postgres','-A','trust','--no-clean']);
run(join(pg,'pg_ctl'),['-D',join(root,'data'),'-l',join(root,'server.log'),'-o',`-k ${root} -p 55469 -h ''`,'start']);
const psql=['-X','-v','ON_ERROR_STOP=1','-h',root,'-p','55469','-U','postgres','-d','postgres'];
const sql=s=>run(join(pg,'psql'),[...psql,'-qAt','-c',s]);
const snapshot=async name=>{
 const projection=await readFile(resolve('scripts/notification-shadow-projection.sql'),'utf8');
 const rows=JSON.parse(sql(projection));
 const history=Object.fromEntries([...new Set(rows.map(r=>r.user_id))].map(id=>[id,{suppressionKnown:true,suppressed:false,deliveryHistoryKnown:true,lastAcceptedAt:null,completedEventIds:[]}]));
 // Explicitly known-empty history is valid only for this never-sent synthetic fixture.
 const result=projectShadow(rows,history,new Date().toISOString());
 await writeFile(join(root,`${name}.json`),JSON.stringify({rows,result},null,2));
 return {rows,result};
};
try{
 await writeFile(join(root,'fixture.log'),run(join(pg,'psql'),[...psql,'-f',resolve('supabase/tests/notification-shadow.sql')]));
 let check=await snapshot('initial'); assert.equal(check.rows.length,2);assert.equal(check.rows.filter(r=>r.eligible).length,1);assert.equal(check.result.batches.length,1);assert.equal(check.result.sendingEnabled,false);
 sql("SET ROLE service_role; SELECT public.set_politician_notification_preference('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','off','UTC'); RESET ROLE;");
 check=await snapshot('opted-out');assert.equal(check.result.batches.length,0);
 sql("SET ROLE service_role; SELECT public.set_politician_notification_preference('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','daily','America/New_York','politician-question-notices-v1'); RESET ROLE; UPDATE auth.users SET email='changed@example.test' WHERE id='00000000-0000-4000-8000-000000000001';");
 check=await snapshot('changed-contact');assert.equal(check.result.batches.length,0);
 sql("SET ROLE service_role; SELECT public.set_politician_notification_preference('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','daily','America/New_York','politician-question-notices-v1'); RESET ROLE; INSERT INTO public.answers(question_id) VALUES('20000000-0000-4000-8000-000000000001');");
 check=await snapshot('answered');assert.equal(check.result.batches.length,0);
 const result={passed:4,sendingEnabled:false,evidence:root,scope:'actual persisted event+preference rows, synthetic local-only database; no delivery'};
 await writeFile(join(root,'result.json'),JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}finally{run(join(pg,'pg_ctl'),['-D',join(root,'data'),'stop','-m','fast']);}
