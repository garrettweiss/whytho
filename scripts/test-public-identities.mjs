/** Loopback-only PostgREST integration against the retained synthetic identity DB. */
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {readFileSync,existsSync,writeFileSync} from 'node:fs';
import {resolve,dirname,join} from 'node:path';
import {createRequire} from 'node:module';
import {runInThisContext} from 'node:vm';
import {createHmac} from 'node:crypto';
import ts from 'typescript';
import {createClient} from '@supabase/supabase-js';
import {NextRequest} from 'next/server.js';
const socket=process.argv[2];
if(!socket?.startsWith('/tmp/whytho-identity-db.')&&!socket?.startsWith('/private/tmp/whytho-identity-db.'))throw Error('Synthetic identity socket required');
const repo=process.cwd();
if(process.argv.includes('--serve') && !repo.startsWith('/private/tmp/') && !repo.startsWith('/tmp/')) throw Error('--serve requires a fresh temporary checkout');
const pg='/opt/homebrew/opt/postgresql@17/bin',binary='/private/tmp/whytho-auth-provider-20261122/postgrest';
const sql=query=>{const r=spawnSync(join(pg,'psql'),['-X','-v','ON_ERROR_STOP=1','-h',socket,'-p','55479','-U','postgres','-d','postgres','-Atc',query],{encoding:'utf8'});if(r.status)throw Error(r.stderr);return r.stdout.trim();};
sql(`CREATE TABLE IF NOT EXISTS public.races(id uuid PRIMARY KEY,slug text,name text,office text,state text,district text,election_date date,election_type text,party text,status text,incumbent_id uuid REFERENCES public.politicians);
CREATE TABLE IF NOT EXISTS public.race_candidates(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),race_id uuid REFERENCES public.races,politician_id uuid REFERENCES public.politicians);
ALTER TABLE public.answers ADD COLUMN IF NOT EXISTS ai_confidence text;
CREATE TABLE IF NOT EXISTS public.answer_media(id uuid PRIMARY KEY,answer_id uuid REFERENCES public.answers,media_type text,public_url text,file_name text);
ALTER TABLE public.x_posts ADD COLUMN IF NOT EXISTS author_handle text;ALTER TABLE public.x_posts ADD COLUMN IF NOT EXISTS author_name text;ALTER TABLE public.x_posts ADD COLUMN IF NOT EXISTS tweet_url text;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='questions_x_post_id_fkey') THEN ALTER TABLE public.questions ADD CONSTRAINT questions_x_post_id_fkey FOREIGN KEY(x_post_id) REFERENCES public.x_posts;END IF;END $$;
CREATE OR REPLACE FUNCTION public.current_week_number() RETURNS integer LANGUAGE sql STABLE AS $$ SELECT 202648 $$;
GRANT SELECT ON public.races,public.race_candidates,public.answer_media,public.x_posts TO anon,authenticated;
INSERT INTO public.politicians(id,slug,full_name,state,office) SELECT ('a0000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid,'pagination-person-'||n,'Pagination Person '||n,'NY','U.S. Representative' FROM generate_series(1,1100)n ON CONFLICT(id) DO NOTHING;
INSERT INTO public.races(id,slug,name,office,state,election_date,election_type,status,incumbent_id) VALUES('b0000000-0000-4000-8000-000000000001','synthetic-race','Synthetic race','U.S. Representative','NY','2026-11-03','general','completed','10000000-0000-4000-8000-000000000002') ON CONFLICT(id) DO NOTHING;
INSERT INTO public.race_candidates(id,race_id,politician_id) VALUES('c0000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),('c0000000-0000-4000-8000-000000000002','b0000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002') ON CONFLICT(id) DO NOTHING;`);
const secret='loopback-only-synthetic-identity-validation-secret',base='http://127.0.0.1:55980';
const tokenParts=[Buffer.from('{"alg":"HS256","typ":"JWT"}').toString('base64url'),Buffer.from(JSON.stringify({role:'anon',exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')];
const key=tokenParts.join('.')+'.'+createHmac('sha256',secret).update(tokenParts.join('.')).digest('base64url');
const server=process.argv.includes("--existing") ? null : spawn(binary,[],{env:{PATH:process.env.PATH,PGRST_DB_URI:`postgresql://postgres@/postgres?host=${socket}&port=55479`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:secret,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:'55980',PGRST_DB_MAX_ROWS:'1000'},stdio:['ignore','ignore','pipe']});
let logs='';server?.stderr.on('data',v=>{logs+=v;});
const results=[];
try{
 for(let n=0;n<100;n++){try{if((await fetch(base)).ok)break;}catch{}if(n===99)throw Error(logs);await new Promise(r=>setTimeout(r,100));}
 const client=createClient(base,key,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(input,init)=>{const url=String(input);assert.ok(url.startsWith(base+'/'));const response=await fetch(url.replace('/rest/v1/','/'),init);if(!response.ok)console.error('Synthetic API failure',url,await response.clone().text());return response;}}});
 const realRequire=createRequire(import.meta.url),modules=new Map();
 const stubs={'server-only':{},'next/cache':{unstable_cache:fn=>fn},'@/lib/supabase/server':{createPublicClient:()=>client}};
 function load(relative){const filename=resolve(repo,relative);if(modules.has(filename))return modules.get(filename).exports;const output=ts.transpileModule(readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,esModuleInterop:true}}).outputText;const mod={exports:{}};modules.set(filename,mod);const req=specifier=>{if(specifier in stubs)return stubs[specifier];if(specifier.startsWith('@/')||specifier.startsWith('.')){const stem=specifier.startsWith('@/')?resolve(repo,specifier.slice(2)):resolve(dirname(filename),specifier);const file=[stem,stem+'.ts',stem+'.tsx'].find(existsSync);if(!file)throw Error(specifier);return load(file);}return realRequire(specifier);};runInThisContext('(function(require,module,exports){'+output+'\n})',{filename})(req,mod,mod.exports);return mod.exports;}
 const profiles=load('lib/profile/server.ts');
 const canonical=await profiles.getProfile('alexandria-original',undefined,'all');
 const alias=await profiles.getProfile('alexandria-candidate',undefined,'all');
 assert.ok(canonical);assert.equal(alias.politician.id,canonical.politician.id);assert.equal(alias.politician.slug,'alexandria-original');assert.equal(alias.politician.photo_url,'https://example.test/portrait.jpg');assert.ok(alias.memberIds.length>=2);assert.deepEqual(alias.questions.map(q=>q.id),canonical.questions.map(q=>q.id));assert.equal(alias.totalQuestions,canonical.totalQuestions);assert.equal(new Set(alias.archiveWeeks).size,alias.archiveWeeks.length);assert.ok(alias.archiveWeeks.length<=8);results.push('Old and canonical profile IDs resolve to the preserved portrait, same complete counts, distinct archives and original question IDs through real PostgREST');
 const directory=load('lib/directory/server.ts');const page=await directory.getDirectoryPage({q:'AOC',state:'',office:'',scope:''});assert.equal(page.people.length,1);assert.equal(page.people[0].id,canonical.politician.id);results.push('Exact source alias returns one canonical directory card');
 const search=load('app/api/politicians/search/route.ts');const found=await search.GET(new NextRequest('http://localhost/api/politicians/search?q=AOC'));assert.equal(found.status,200);const foundRows=(await found.json()).politicians;assert.equal(foundRows.filter(p=>p.id===canonical.politician.id).length,1);assert.ok(!foundRows.some(p=>p.slug==='alexandria-candidate'));results.push('Fuzzy/alias search resolves canonical IDs without duplicate cards');
 const index=await load('app/api/politicians/search-index/route.ts').GET();assert.equal(index.status,200);const indexRows=await index.json();const expected=Number(sql('SELECT count(*) FROM public.politicians WHERE is_active AND NOT is_test AND canonical_politician_id IS NULL'));assert.equal(indexRows.length,expected);assert.ok(indexRows.length>1000);assert.equal(new Set(indexRows.map(p=>p.s)).size,expected);results.push('Search index enumerates all canonical profiles beyond the 1000-row API cap');
 const sitemap=await load('app/sitemap.ts').default();assert.equal(sitemap.length,expected+13);assert.ok(!sitemap.some(p=>p.url.endsWith('/alexandria-candidate')));results.push('Sitemap includes every canonical profile and excludes duplicate URLs');
 const election=await load('lib/elections/server.ts').loadElectionDetail('synthetic-race',1);assert.equal(election.totalCandidates,1);assert.equal(election.candidates[0].id,canonical.politician.id);assert.equal(election.recordedOfficeholder.id,canonical.politician.id);results.push('Race memberships and incumbent references retain their source records while showing one canonical person');
 const leaderboard=await load('lib/leaderboard/server.ts').getLeaderboard();assert.equal(new Set(leaderboard.entries.map(p=>p.id)).size,leaderboard.entries.length);assert.ok(!leaderboard.entries.some(p=>p.slug==='alexandria-candidate'));results.push('Leaderboard canonical aggregation executes through real PostgREST');
 console.log(JSON.stringify({passed:results.length,results,socket},null,2));
 if(process.argv.includes('--serve')) {
   // Local public-data origin only; no production or user credentials.
   writeFileSync(join(repo,'.env.local'),`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:55981\nNEXT_PUBLIC_SUPABASE_ANON_KEY=${key}\nSUPABASE_SERVICE_ROLE_KEY=${key}\nNEXT_PUBLIC_SITE_URL=http://127.0.0.1:55982\nNEXT_TELEMETRY_DISABLED=1\n`,{mode:0o600,flag:'wx'});
   const {createServer}=await import('node:http');
   const proxy=createServer(async(req,res)=>{try{const chunks=[];for await(const chunk of req)chunks.push(chunk);const body=Buffer.concat(chunks);const path=req.url.replace(/^\/rest\/v1/,'');if(!req.url.startsWith('/rest/v1')){res.writeHead(401);res.end('{}');return;}const headers={...req.headers};delete headers.host;delete headers['content-length'];const response=await fetch(base+path,{method:req.method,headers,...(body.length?{body}:{})});res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([k])=>!['content-encoding','content-length','transfer-encoding'].includes(k))));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(502);res.end('{}');}});
   await new Promise((yes,no)=>{proxy.once('error',no);proxy.listen(55981,'127.0.0.1',yes);});
   console.log('Local public data serving on 55981');
   await new Promise(yes=>{process.once('SIGTERM',yes);process.once('SIGINT',yes);});
   proxy.closeAllConnections();await new Promise(yes=>proxy.close(yes));
 }

}finally{server?.kill('SIGTERM');writeFileSync(join(socket,'public-integration-results.json'),JSON.stringify({results,postgrest_log:logs},null,2));}
