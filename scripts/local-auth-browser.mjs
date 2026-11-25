/** Actual WhyTho sign-in and callback inside isolated Next, with real local Auth. */
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {readFile,writeFile,mkdir,copyFile,symlink,open} from 'node:fs/promises';
import {join,resolve,dirname} from 'node:path';
import {createHash} from 'node:crypto';
export async function runLocalSSRBrowser({root,authBase,messages,runtime,roleData}){
 const app=join(root,'next-app'),repo=process.cwd(),appOrigin='http://localhost:55972',proxyOrigin='http://127.0.0.1:55973';
 await mkdir(app,{recursive:true});
 const hashes=[];
 for(const file of ['components/auth/sign-in-form.tsx','components/auth/safe-return-path.ts','components/account/account.module.css','lib/supabase/client.ts','lib/supabase/server.ts','app/auth/callback/route.ts','types/database.ts',...(roleData?['app/api/verify/claim/route.ts','app/api/dashboard/team/route.ts','app/api/dashboard/disconnect/route.ts','app/api/answers/route.ts','app/api/answers/[id]/approve/route.ts','app/api/answers/[id]/route.ts','app/api/settings/office-notifications/route.ts','lib/security/bounded-json.ts','lib/security/request-policy.ts','lib/notifications/consent.ts','lib/accounts/request.ts','lib/security/durable-rate-limit.ts','lib/email/resend.ts','lib/email/templates.ts']:[])]){
  await mkdir(dirname(join(app,file)),{recursive:true});await copyFile(join(repo,file),join(app,file));hashes.push({file,sha256:createHash('sha256').update(await readFile(join(app,file))).digest('hex')});
 }
 await symlink(join(runtime,'node_modules'),join(app,'node_modules'));
 await writeFile(join(app,'package.json'),JSON.stringify({private:true,scripts:{dev:'next dev'}}));
 await writeFile(join(app,'tsconfig.json'),JSON.stringify({compilerOptions:{target:'ES2020',lib:['dom','esnext'],strict:true,noEmit:true,module:'esnext',moduleResolution:'bundler',jsx:'preserve',esModuleInterop:true,resolveJsonModule:true,baseUrl:'.',paths:{'@/*':['./*']}},include:['**/*.ts','**/*.tsx']}));
 await writeFile(join(app,'next.config.mjs'),'export default { devIndicators:false };');
 await writeFile(join(app,'app/layout.tsx'),`export default function Layout({children}:{children:React.ReactNode}){return <html><body>{children}</body></html>}`);
 await mkdir(join(app,'app/sign-in'),{recursive:true});
 await writeFile(join(app,'app/sign-in/page.tsx'),`import {SignInForm} from '@/components/auth/sign-in-form'; export default function Page(){return <SignInForm redirectAfter='/proof?marker=kept#answer'/>}`);
 await mkdir(join(app,'app/proof'),{recursive:true});
 await writeFile(join(app,'app/proof/page.tsx'),`import {createClient} from '@/lib/supabase/server'; import {cookies} from 'next/headers'; export const dynamic='force-dynamic'; export default async function Page(){const cookieNames=(await cookies()).getAll().map(c=>c.name);const c=await createClient();const {data:{session}}=await c.auth.getSession();const {data:{user},error}=await c.auth.getUser();return <pre id='identity'>{JSON.stringify({authenticated:!!user,id:user?.id,email:user?.email,error:!!error,error_code:error?.code,error_message:error?.message,cookie_names:cookieNames,session_present:!!session,provider_host:new URL(process.env.NEXT_PUBLIC_SUPABASE_URL!).host})}</pre>}`);
 await mkdir(join(app,'app/api/sign-out'),{recursive:true});
 await writeFile(join(app,'app/api/sign-out/route.ts'),`import {createClient} from '@/lib/supabase/server';export async function POST(){const c=await createClient();const {error}=await c.auth.signOut();return Response.json({ok:!error},{status:error?500:200})}`);
 const proxy=createServer(async(req,res)=>{try{assert.ok(req.url.startsWith('/auth/v1/')||req.url.startsWith('/verify?')||(roleData&&req.url.startsWith('/rest/v1/')));const headers={...req.headers};delete headers.host;delete headers.connection;delete headers['content-length'];const parts=[];for await(const part of req)parts.push(part);const body=Buffer.concat(parts);const isRest=req.url.startsWith('/rest/v1/');const path=isRest?req.url.slice('/rest/v1'.length):req.url.startsWith('/auth/v1/')?req.url.slice('/auth/v1'.length):req.url;const response=await fetch((isRest?roleData.base:authBase)+path,{method:req.method,headers,...(body.length?{body}:{}),redirect:'manual'});res.writeHead(response.status,Object.fromEntries([...response.headers].filter(([k])=>!['content-encoding','content-length','transfer-encoding'].includes(k))));res.end(Buffer.from(await response.arrayBuffer()));}catch{res.writeHead(502);res.end('Local Auth proxy failure');}});
 await new Promise((yes,no)=>{proxy.once('error',no);proxy.listen(55973,'127.0.0.1',yes);});
 const log=await open(join(root,'next.log'),'a',0o600);
 const next=spawn(process.execPath,[join(runtime,'node_modules/next/dist/bin/next'),'dev','--hostname','127.0.0.1','--port','55972'],{cwd:app,env:{PATH:process.env.PATH,NEXT_TELEMETRY_DISABLED:'1',NEXT_PUBLIC_SUPABASE_URL:proxyOrigin,NEXT_PUBLIC_SUPABASE_ANON_KEY:roleData?.anonKey||'synthetic-public-test-key',SUPABASE_SERVICE_ROLE_KEY:roleData?.serviceKey||'',NODE_ENV:'development'},stdio:['ignore',log.fd,log.fd]});
 const require=createRequire(join(runtime,'package.json'));const {chromium}=require('playwright');let context;
 const results=[],roleResults=[];const browserErrors=[];
 async function waitFor(fn,limit=60000){const until=Date.now()+limit;while(Date.now()<until){try{const v=await fn();if(v)return v;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Local SSR test wait timed out');}
 function link(raw){const text=raw.replace(/=\r\n/g,'').replace(/=3D/g,'=').replace(/&amp;/g,'&');const m=text.match(/http:\/\/127\.0\.0\.1:55973\/(?:auth\/v1\/)?verify\?[^\s"<>]+/);assert.ok(m,'Real captured email contains loopback Auth link');return m[0];}
 try{
  await waitFor(async()=>{const r=await fetch(appOrigin+'/sign-in');return r.ok;},120000);
  context=await chromium.launchPersistentContext(join(root,'ssr-chrome-profile'),{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',viewport:{width:1100,height:900}});
  await context.route('**/*',route=>{const u=new URL(route.request().url());return ['127.0.0.1','localhost'].includes(u.hostname)?route.continue():route.abort();});
  const page=await context.newPage();page.on('pageerror',error=>browserErrors.push(error.message));const requestCookies=[];page.on('request',request=>{if(new URL(request.url()).pathname==='/proof')requestCookies.push({path:'/proof',names:(request.headers().cookie||'').split(';').filter(Boolean).map(c=>c.split('=')[0].trim())});});
  await page.goto(appOrigin+'/sign-in');const before=messages.length;
  await page.getByLabel('Email address',{exact:true}).fill('browser@example.test');await page.getByRole('button',{name:'Email me a sign-in link',exact:true}).click();await page.getByRole('heading',{name:'Check your email.',exact:true}).waitFor();
  await waitFor(()=>messages.length>before);assert.ok((await context.cookies()).some(c=>c.name.includes('code-verifier')));results.push('Actual WhyTho sign-in form issues OTP and stores browser PKCE verifier cookie');
  const magic=link(messages.at(-1));const callback=page.waitForResponse(r=>new URL(r.url()).pathname==='/auth/callback');await page.goto(magic);const response=await callback;assert.ok([302,303,307,308].includes(response.status()));
  await page.waitForURL(u=>u.pathname==='/proof');const identity=JSON.parse(await page.locator('#identity').innerText());let reloadIdentity;if(!identity.authenticated){await page.reload();reloadIdentity=JSON.parse(await page.locator('#identity').innerText());}await writeFile(join(root,'ssr-session-diagnostic.json'),JSON.stringify({identity,reload_identity:reloadIdentity,request_cookie_names:requestCookies,callback_status:response.status(),callback_set_cookie:(await response.headersArray()).filter(h=>h.name.toLowerCase()==='set-cookie').map(h=>h.value.split('=')[0]),cookie_names:(await context.cookies()).map(c=>({name:c.name,size:c.value.length,path:c.path,domain:c.domain,secure:c.secure,sameSite:c.sameSite}))},null,2),{mode:0o600});assert.equal(new URL(page.url()).origin,appOrigin);assert.equal(identity.authenticated,true);assert.equal(identity.email,'browser@example.test');assert.ok(identity.id);assert.equal(new URL(page.url()).searchParams.get('marker'),'kept');assert.equal(new URL(page.url()).hash,'#answer');
  assert.ok((await response.headersArray()).some(h=>h.name.toLowerCase()==='set-cookie'));assert.ok((await context.cookies()).some(c=>c.name.includes('auth-token')&&!c.name.includes('code-verifier')));results.push('Actual Next callback exchanges real PKCE code, persists session cookies and preserves safe next path');
  await page.reload();assert.equal(JSON.parse(await page.locator('#identity').innerText()).id,identity.id);results.push('Subsequent server-rendered request resolves the same real Auth identity from SSR cookies');
  await page.screenshot({path:join(root,'ssr-session.png'),fullPage:true});
  if(roleData){
   const login=async email=>{const c=await context.browser().newContext();await c.route('**/*',r=>['localhost','127.0.0.1'].includes(new URL(r.request().url()).hostname)?r.continue():r.abort());const p=await c.newPage();await p.goto(appOrigin+'/sign-in');const n=messages.length;await p.getByLabel('Email address',{exact:true}).fill(email);await p.getByRole('button',{name:'Email me a sign-in link',exact:true}).click();await p.getByRole('heading',{name:'Check your email.',exact:true}).waitFor();await waitFor(()=>messages.length>n);await p.goto(link(messages.at(-1)));await p.waitForURL(u=>u.pathname==='/proof');const i=JSON.parse(await p.locator('#identity').innerText());assert.equal(i.authenticated,true);assert.equal(i.email,email);return{context:c,page:p};};
   const {runLocalRoleJourneys}=await import('./local-account-data.mjs');roleResults.push(...await runLocalRoleJourneys({adminPage:page,login,query:roleData.query,base:roleData.base,anonKey:roleData.anonKey}));
  }

  const logout=await page.evaluate(async()=>{const r=await fetch('/api/sign-out',{method:'POST'});return{status:r.status,body:await r.json()};});assert.equal(logout.status,200);assert.equal(logout.body.ok,true);await page.goto(appOrigin+'/proof');assert.equal(JSON.parse(await page.locator('#identity').innerText()).authenticated,false);results.push('Real SSR sign-out clears session and next server request is unauthenticated');
  await page.goto(appOrigin+'/auth/callback');await page.waitForURL(u=>u.pathname==='/sign-in'&&u.searchParams.get('error')==='auth_callback_failed');results.push('Actual callback without code fails safely to sign-in');
  assert.deepEqual(browserErrors,[]);
  return [...results,...roleResults];
 }finally{
  await writeFile(join(root,'ssr-browser-results.json'),JSON.stringify({results,role_results:roleResults,passed:results.length,expected:5,browser_errors:browserErrors,source_hashes:hashes,scope:'actual WhyTho form/client/callback/servercookie adapters in isolated minimal Next app + real Auth; no application data API or office proof'},null,2),{mode:0o600});
  if(context)await context.close();next.kill('SIGTERM');await Promise.race([new Promise(r=>next.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);proxy.closeAllConnections();await new Promise(r=>proxy.close(r));
 }
}
