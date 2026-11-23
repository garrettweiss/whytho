/** Real native Supabase Auth + synthetic PostgreSQL + loopback SMTP only.
 * No production credentials, real inboxes, cleanup or external provider calls.
 * Usage: node scripts/test-local-auth-provider.mjs /path/to/verified/auth
 */
import assert from 'node:assert/strict';
import {createServer} from 'node:net';
import {spawn,spawnSync} from 'node:child_process';
import {mkdtemp,writeFile,open,chmod} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {randomBytes,createHash} from 'node:crypto';
const root=await mkdtemp(join(tmpdir(),'whytho-real-auth.'));
const pg='/opt/homebrew/opt/postgresql@17/bin';
const authBinary=resolve(process.argv[2]);
const dbPort=55571,authPort=55971,smtpPort=55271;
const base=`http://127.0.0.1:${authPort}`;
const browserMode=process.argv.includes('--browser');
const roleMode=process.argv.includes('--roles'),jwtSecret=randomBytes(48).toString('hex');
const messages=[],results=[];
function command(file,args){const r=spawnSync(file,args,{encoding:'utf8'});if(r.status!==0)throw new Error(`${file} failed: ${r.stderr}`);return r.stdout;}
const smtp=createServer(socket=>{
 socket.setEncoding('utf8');socket.write('220 local-test SMTP\r\n');let buffer='',data=false,body='';
 socket.on('data',chunk=>{buffer+=chunk;let end;while((end=buffer.indexOf('\r\n'))>=0){const line=buffer.slice(0,end);buffer=buffer.slice(end+2);if(data){if(line==='.'){messages.push(body);body='';data=false;socket.write('250 captured locally\r\n');}else{body+=line+'\r\n';if(body.length>1000000)socket.destroy();}}else if(/^EHLO|^HELO/i.test(line))socket.write('250-local-test\r\n250 8BITMIME\r\n');else if(/^DATA/i.test(line)){data=true;socket.write('354 End with dot\r\n');}else if(/^QUIT/i.test(line)){socket.end('221 bye\r\n');}else socket.write('250 OK\r\n');}});
 socket.on('error',()=>{});
});
await new Promise((yes,no)=>{smtp.once('error',no);smtp.listen(smtpPort,'127.0.0.1',yes);});
let auth,roleData,pgStarted=false;
async function waitFor(fn,limit=15000){const deadline=Date.now()+limit;while(Date.now()<deadline){try{const v=await fn();if(v)return v;}catch{}await new Promise(r=>setTimeout(r,100));}throw new Error('Timed out waiting for local service');}
async function request(path,body,token){const response=await fetch(base+path,{method:body===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:`Bearer ${token}`}:{})},...(body===undefined?{}:{body:JSON.stringify(body)}),redirect:'manual',signal:AbortSignal.timeout(10000)});let json={};try{json=await response.json();}catch{}return{status:response.status,json,headers:response.headers};}
function emailLink(raw){const decoded=raw.replace(/=\r\n/g,'').replace(/=3D/g,'=').replace(/&amp;/g,'&');const match=decoded.match(/https?:\/\/127\.0\.0\.1:\d+\/verify\?[^\s"<>]+/);assert.ok(match,'Captured email contains local verification link');const u=new URL(match[0]);assert.equal(u.origin,base);return u;}
async function pkce(email,{badVerifier=false}={}){const verifier=randomBytes(48).toString('base64url');const challenge=createHash('sha256').update(verifier).digest('base64url');const count=messages.length;const issued=await request('/otp',{email,create_user:true,code_challenge:challenge,code_challenge_method:'s256'});assert.equal(issued.status,200,JSON.stringify(issued.json));await waitFor(()=>messages.length>count);const link=emailLink(messages.at(-1));const verified=await fetch(link,{redirect:'manual'});assert.equal(verified.status,303);const location=new URL(verified.headers.get('location'));assert.equal(location.origin,'http://127.0.0.1:55972');const code=location.searchParams.get('code');assert.ok(code,'PKCE verification issues authorization code');const exchange=await request('/token?grant_type=pkce',{auth_code:code,code_verifier:badVerifier?'wrong-verifier-for-negative-test':verifier});return{link,code,verifier,exchange};}
try{
 command(join(pg,'initdb'),['-D',join(root,'data'),'-U','postgres','-A','trust','--no-clean']);
 command(join(pg,'pg_ctl'),['-D',join(root,'data'),'-l',join(root,'postgres.log'),'-o',`-k ${root} -p ${dbPort} -h 127.0.0.1`,'start']);pgStarted=true;
 command(join(pg,'psql'),['-X','-v','ON_ERROR_STOP=1','-h',root,'-p',String(dbPort),'-U','postgres','-d','postgres','-c','CREATE SCHEMA auth; ALTER ROLE postgres SET search_path=auth,public;']);
 const log=await open(join(root,'auth.log'),'a',0o600);
 auth=spawn(authBinary,[],{cwd:root,env:{PATH:process.env.PATH,GOTRUE_API_HOST:'127.0.0.1',PORT:String(authPort),API_EXTERNAL_URL:browserMode?'http://127.0.0.1:55973/auth/v1':base,GOTRUE_SITE_URL:browserMode?'http://localhost:55972':'http://127.0.0.1:55972',GOTRUE_URI_ALLOW_LIST:browserMode?'http://localhost:55972/**':'http://127.0.0.1:55972/**',GOTRUE_DB_DRIVER:'postgres',GOTRUE_DB_DATABASE_URL:`postgresql://postgres@127.0.0.1:${dbPort}/postgres?sslmode=disable`,GOTRUE_JWT_SECRET:jwtSecret,GOTRUE_JWT_EXP:'3600',GOTRUE_JWT_AUD:'authenticated',GOTRUE_JWT_DEFAULT_GROUP_NAME:'authenticated',GOTRUE_EXTERNAL_EMAIL_ENABLED:'true',GOTRUE_MAILER_AUTOCONFIRM:'false',GOTRUE_SMTP_HOST:'127.0.0.1',GOTRUE_SMTP_PORT:String(smtpPort),GOTRUE_SMTP_ADMIN_EMAIL:'no-reply@example.test',GOTRUE_SMTP_SENDER_NAME:'Local synthetic tests',GOTRUE_SMTP_MAX_FREQUENCY:'0s',GOTRUE_RATE_LIMIT_EMAIL_SENT:'100',GOTRUE_SECURITY_REFRESH_TOKEN_ROTATION_ENABLED:'true',GOTRUE_SECURITY_REFRESH_TOKEN_REUSE_INTERVAL:'0',GOTRUE_TRACING_ENABLED:'false',GOTRUE_METRICS_ENABLED:'false',LOG_LEVEL:'warn'},stdio:['ignore',log.fd,log.fd]});
 await waitFor(async()=>{const r=await fetch(base+'/health');return r.ok;},30000);
 if(roleMode){const {startLocalAccountData}=await import('./local-account-data.mjs');roleData=await startLocalAccountData({root,pg,dbPort,jwtSecret,binary:resolve('/private/tmp/whytho-auth-provider-20261122/postgrest')});await waitFor(async()=>{const r=await fetch(roleData.base);return r.ok;},15000);}
 if(browserMode){const {runLocalSSRBrowser}=await import('./local-auth-browser.mjs');results.push(...await runLocalSSRBrowser({root,authBase:base,messages,roleData,runtime:resolve(process.argv.at(-1))}));}
 else {
 assert.equal((await request('/user')).status,401);results.push('Unauthenticated user lookup denied');
 const first=await pkce('admin@example.test');assert.equal(first.exchange.status,200,JSON.stringify(first.exchange.json));const session=first.exchange.json;assert.ok(session.access_token&&session.refresh_token);assert.equal(session.user.email,'admin@example.test');assert.ok(session.user.email_confirmed_at);results.push('Real OTP email captured locally; magic link and PKCE exchange establish confirmed session');
 const identity=await request('/user',undefined,session.access_token);assert.equal(identity.status,200);assert.equal(identity.json.id,session.user.id);results.push('Access token resolves the correct confirmed identity');
 const reused=await request('/token?grant_type=pkce',{auth_code:first.code,code_verifier:first.verifier});assert.ok(reused.status>=400);results.push('Consumed PKCE authorization code cannot be reused');
 const replay=await fetch(first.link,{redirect:'manual'});assert.match(replay.headers.get('location')||'',/error/);results.push('Consumed email verification link cannot be reused');
 const wrong=await pkce('outsider@example.test',{badVerifier:true});assert.ok(wrong.exchange.status>=400);results.push('Wrong PKCE verifier cannot redeem another identity');
 const refreshed=await request('/token?grant_type=refresh_token',{refresh_token:session.refresh_token});assert.equal(refreshed.status,200);assert.equal(refreshed.json.user.id,session.user.id);results.push('Real refresh token renews the same identity');
 const logout=await request('/logout',{},refreshed.json.access_token);assert.equal(logout.status,204);const afterLogout=await request('/token?grant_type=refresh_token',{refresh_token:refreshed.json.refresh_token});assert.ok(afterLogout.status>=400);results.push('Signed-out session refresh is denied');
 }
 console.log(JSON.stringify({passed:results.length,results,root,scope:'native Supabase Auth PKCE+loopback SMTP; synthetic host PostgreSQL; not full WhyTho application/browser integration'}));
}finally{
 if(roleData){roleData.processHandle.kill('SIGTERM');await new Promise(r=>setTimeout(r,200));await roleData.logFile.close();}
 if(auth){auth.kill('SIGTERM');await Promise.race([new Promise(r=>auth.once('exit',r)),new Promise(r=>setTimeout(r,3000))]);}
 if(pgStarted)command(join(pg,'pg_ctl'),['-D',join(root,'data'),'stop','-m','fast']);
 smtp.close();
 await writeFile(join(root,'results.json'),JSON.stringify({checked_at:new Date().toISOString(),scope:'native Supabase Auth v2.198.0; synthetic PostgreSQL and local-only SMTP; not deployed WhyTho E2E',results,passed:results.length},null,2),{mode:0o600});
 await chmod(root,0o700);console.error(`Retained local evidence: ${root}`);
}
