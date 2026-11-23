/** Synthetic schema plus actual account RPCs, exposed by official local PostgREST. */
import {spawn,spawnSync} from 'node:child_process';
import {readFile,writeFile,open} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {createHmac,createHash} from 'node:crypto';
export async function startLocalAccountData({root,pg,dbPort,jwtSecret,binary}){
 const query=sql=>{const r=spawnSync(join(pg,'psql'),['-X','-v','ON_ERROR_STOP=1','-h',root,'-p',String(dbPort),'-U','postgres','-d','postgres','-Atc',sql],{encoding:'utf8'});if(r.status!==0)throw new Error(r.stderr);return r.stdout.trim();};
 query(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role BYPASSRLS;
 CREATE TYPE public.politician_team_role AS ENUM ('admin','editor','responder');CREATE TYPE public.answer_type AS ENUM ('direct','team_statement','ai_analysis');
 CREATE TABLE public.politicians(id uuid PRIMARY KEY,full_name text,slug text,verification_tier text,is_active boolean DEFAULT true,is_test boolean DEFAULT false);
 CREATE TABLE public.politician_team(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),politician_id uuid REFERENCES public.politicians,user_id uuid REFERENCES auth.users,role public.politician_team_role,invited_by uuid,created_at timestamptz DEFAULT now(),UNIQUE(politician_id,user_id));
 CREATE TABLE public.questions(id uuid PRIMARY KEY,politician_id uuid REFERENCES public.politicians,status text DEFAULT 'active',week_number int DEFAULT 202647,net_upvotes int DEFAULT 12,submitted_by uuid REFERENCES auth.users,body text DEFAULT 'Synthetic question',source text DEFAULT 'user',is_seeded boolean DEFAULT false,x_post_id uuid,created_at timestamptz DEFAULT now());
 CREATE TABLE public.answers(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),question_id uuid REFERENCES public.questions,politician_id uuid REFERENCES public.politicians,week_number int,body text,sources jsonb,answer_type public.answer_type,is_draft boolean,is_ai_generated boolean,is_disputed boolean,published_by uuid,created_at timestamptz DEFAULT now());
 CREATE TABLE public.user_profiles(id uuid PRIMARY KEY REFERENCES auth.users,display_name text,notify_answer boolean DEFAULT false);
 ALTER TABLE public.politicians ENABLE ROW LEVEL SECURITY;ALTER TABLE public.politician_team ENABLE ROW LEVEL SECURITY;ALTER TABLE public.questions ENABLE ROW LEVEL SECURITY;ALTER TABLE public.answers ENABLE ROW LEVEL SECURITY;ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
 GRANT USAGE ON SCHEMA public TO anon,authenticated,service_role;GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
 GRANT SELECT ON public.politician_team TO authenticated;GRANT SELECT ON public.answers,public.questions TO anon,authenticated;
 CREATE POLICY public_questions ON public.questions FOR SELECT TO anon,authenticated USING(status='active');
 CREATE POLICY public_answers ON public.answers FOR SELECT TO anon,authenticated USING(NOT is_draft AND NOT is_ai_generated);
 CREATE POLICY own_membership ON public.politician_team FOR SELECT TO authenticated USING(user_id=(current_setting('request.jwt.claims',true)::jsonb->>'sub')::uuid);
 INSERT INTO public.politicians VALUES('33333333-3333-4333-8333-333333333333','Synthetic Office','synthetic-office','0',true,false);
 INSERT INTO public.questions(id,politician_id) SELECT ('44444444-4444-4444-8444-'||lpad(n::text,12,'0'))::uuid,'33333333-3333-4333-8333-333333333333' FROM generate_series(1,4)n;
 `);
 const migration=await readFile(resolve('supabase/migrations/20261031205615_account_transitions.sql'),'utf8');query(migration);
 const security=await readFile(resolve('supabase/migrations/20261031205619_launch_security.sql'),'utf8');const rates=security.slice(security.indexOf('CREATE TABLE IF NOT EXISTS public.security_rate_limits'),security.indexOf('-- Serialize per-user question quotas'));query(rates);
 const integratedMigrations=[];
 for(const file of ['20261119000100_question_notification_events.sql','20261122000100_politician_notification_preferences.sql','20261122000200_answer_corrections.sql']){const source=await readFile(resolve('supabase/migrations',file),'utf8');query(source);integratedMigrations.push({file,sha256:createHash('sha256').update(source).digest('hex')});}
 const token=role=>{const head=Buffer.from(JSON.stringify({alg:'HS256',typ:'JWT'})).toString('base64url'),body=Buffer.from(JSON.stringify({role,iss:'supabase',iat:Math.floor(Date.now()/1000),exp:Math.floor(Date.now()/1000)+3600})).toString('base64url');return `${head}.${body}.${createHmac('sha256',jwtSecret).update(`${head}.${body}`).digest('base64url')}`;};
 const log=await open(join(root,'postgrest.log'),'a',0o600);
 const processHandle=spawn(binary,[],{cwd:root,env:{PATH:process.env.PATH,PGRST_DB_URI:`postgresql://postgres@127.0.0.1:${dbPort}/postgres?sslmode=disable`,PGRST_DB_SCHEMAS:'public',PGRST_DB_ANON_ROLE:'anon',PGRST_JWT_SECRET:jwtSecret,PGRST_SERVER_HOST:'127.0.0.1',PGRST_SERVER_PORT:'55974',PGRST_LOG_LEVEL:'warn'},stdio:['ignore',log.fd,log.fd]});
 await writeFile(join(root,'account-schema-provenance.json'),JSON.stringify({scope:'minimal synthetic public schema, actual Auth schema, actual account migration and security-rate function excerpt; notification event, preference and correction migrations in chronological order',account_migration_sha256:createHash('sha256').update(migration).digest('hex'),rate_function_sha256:createHash('sha256').update(rates).digest('hex'),integrated_migrations:integratedMigrations},null,2));
 return{query,processHandle,logFile:log,base:'http://127.0.0.1:55974',anonKey:token('anon'),serviceKey:token('service_role')};
}

export async function runLocalRoleJourneys({adminPage,login,query,base,anonKey}){
 const results=[],pol='33333333-3333-4333-8333-333333333333',question=n=>`44444444-4444-4444-8444-${String(n).padStart(12,'0')}`;
 const call=(page,path,body,method='POST')=>page.evaluate(async({path,body,method})=>{const r=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});return{status:r.status,body:await r.json()};},{path,body,method});
 const assert=(await import('node:assert/strict')).default;
 let r=await call(adminPage,'/api/verify/claim',{politician_id:pol});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.resumed,false);results.push('Real session claims synthetic office through actual Next route and PostgreSQL function');
 r=await call(adminPage,'/api/verify/claim',{politician_id:pol});assert.equal(r.status,200);assert.equal(r.body.resumed,true);results.push('Office claim resumes idempotently across actual API and database');
 r=await call(adminPage,'/api/answers',{question_id:question(1),body:'Pending office prepares a private response.'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.is_draft,true);results.push('Unverified office admin is restricted to a real private database draft');
 const editor=await login('editor@example.test'),responder=await login('responder@example.test'),outsider=await login('outsider@example.test');
 try{
  for(const[email,role]of[['editor@example.test','editor'],['responder@example.test','responder']]){r=await call(adminPage,'/api/dashboard/team',{politician_id:pol,email,role});assert.equal(r.status,201,JSON.stringify(r));}
  results.push('Actual admin team route adds real Auth users with editor/responder roles');
  query(`UPDATE public.politicians SET verification_tier='2' WHERE id='${pol}'`);
  r=await call(responder.page,'/api/answers',{question_id:question(2),body:'Responder draft awaits editor approval.'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.is_draft,true);const draft=r.body.answer_id;
  r=await call(responder.page,`/api/answers/${draft}/approve`,{});assert.equal(r.status,403,JSON.stringify(r));results.push('Real responder session can draft but cannot approve its own answer');
  r=await call(editor.page,`/api/answers/${draft}/approve`,{});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.is_draft,false);assert.equal(query(`SELECT is_draft FROM public.answers WHERE id='${draft}'`),'f');results.push('Actual editor approval publishes the saved responder draft in PostgreSQL');
  r=await call(editor.page,'/api/answers',{question_id:question(3),body:'Verified editor publishes a direct response.'});assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.is_draft,false);results.push('Verified editor publishes through the real session/API/PostgREST/database chain');
  const published=r.body.answer_id,correctionId='77777777-7777-4777-8777-777777777777',correctionText='Our office wishes to correct its earlier response with this dated clarification.';
  r=await call(editor.page,`/api/answers/${published}`,{body:'Attempt to silently replace the original published response.'},'PATCH');assert.equal(r.status,422,JSON.stringify(r));results.push('Integrated correction trigger blocks silent overwrite through the actual edit route');
  r=await call(editor.page,`/api/answers/${published}`,{body:correctionText,correctionId});assert.equal(r.status,200,JSON.stringify(r));assert.ok(r.body.created_at);results.push('Actual correction route stores a dated correction through the real database function');
  assert.equal(query(`SELECT body FROM public.answers WHERE id='${published}'`),'Verified editor publishes a direct response.');results.push('Original published wording remains unchanged after a correction');
  r=await call(editor.page,`/api/answers/${published}`,{body:correctionText,correctionId});assert.equal(r.status,200);assert.equal(query(`SELECT count(*) FROM public.answer_corrections WHERE answer_id='${published}'`),'1');results.push('Repeating the same correction request is idempotent in the actual database');
  const publicCorrections=await fetch(`${base}/answer_corrections?answer_id=eq.${published}&select=id,body,created_at`,{headers:{Authorization:`Bearer ${anonKey}`}});assert.equal(publicCorrections.status,200);const visible=await publicCorrections.json();assert.equal(visible.length,1);assert.equal(visible[0].body,correctionText);assert.ok(visible[0].created_at);results.push('Anonymous PostgREST reads expose the dated correction alongside the retained original');
  r=await call(responder.page,`/api/answers/${published}`,{body:'A responder must not publish a correction.',correctionId:'88888888-8888-4888-8888-888888888888'});assert.equal(r.status,403);results.push('Responder cannot publish a public correction through actual route and SQL permissions');
  const preferencePath='/api/settings/office-notifications',daily={politician_id:pol,mode:'daily',timezone:'America/New_York',consent_version:'politician-question-notices-v1'};
  r=await call(editor.page,preferencePath,daily,'PATCH');assert.equal(r.status,200,JSON.stringify(r));assert.equal(r.body.sending_enabled,false);assert.equal(r.body.preference.mode,'daily');results.push('Actual office preference route records verified member daily consent while sending stays disabled');
  const editorPreferences=await editor.page.evaluate(async path=>{const r=await fetch(path);return{status:r.status,cache:r.headers.get('cache-control'),body:await r.json()};},preferencePath);assert.equal(editorPreferences.status,200);assert.match(editorPreferences.cache,/private.*no-store/);assert.equal(editorPreferences.body.preferences[0].mode,'daily');results.push('Actual settings GET returns the member preference with private no-store caching');
  r=await call(editor.page,preferencePath,{...daily,consent_version:'old-text'},'PATCH');assert.equal(r.status,400);results.push('Stale consent wording is refused by the actual preference input validation');
  r=await call(outsider.page,preferencePath,daily,'PATCH');assert.equal(r.status,403);results.push('Unrelated real Auth identity cannot subscribe to an office digest');
  r=await call(editor.page,preferencePath,{politician_id:pol,mode:'off'},'PATCH');assert.equal(r.status,200);assert.equal(r.body.preference.mode,'off');assert.ok(r.body.preference.revoked_at);assert.equal(r.body.sending_enabled,false);results.push('Actual opt-out records revocation and keeps sending disabled');
  const privatePrefs=await fetch(`${base}/politician_notification_preferences?select=mode`,{headers:{Authorization:`Bearer ${anonKey}`}});assert.equal(privatePrefs.status,401);results.push('Anonymous direct data API cannot read private notification preferences');
  r=await call(outsider.page,'/api/answers',{question_id:question(4),body:'An outsider must never publish for this office.'});assert.equal(r.status,403);results.push('Real unrelated Auth identity cannot publish for the office');
  r=await call(editor.page,'/api/dashboard/team',{politician_id:pol,email:'outsider@example.test',role:'admin'});assert.equal(r.status,403);results.push('Editor cannot escalate an outsider to team admin through actual route');
  r=await call(adminPage,'/api/dashboard/disconnect',{politician_id:pol},'DELETE');assert.equal(r.status,422);assert.equal(query(`SELECT count(*) FROM public.politician_team WHERE politician_id='${pol}' AND role='admin'`),'1');results.push('Last-admin disconnect is refused before any membership deletion');
  assert.equal(query(`SELECT count(*) FROM public.answers WHERE question_id='${question(4)}'`),'0');results.push('Denied outsider publication leaves no answer row');
  return results;
 }finally{await editor.context.close();await responder.context.close();await outsider.context.close();}
}
