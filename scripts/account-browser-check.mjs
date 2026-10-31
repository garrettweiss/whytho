/**
 * Real Chrome interactions with production account components and mocked HTTP.
 * This is a component-browser integration, not an OAuth/provider E2E test.
 * Run from a local-disk checkout with esbuild, React and Sharp installed:
 * node scripts/account-browser-check.mjs /tmp/whytho-account-browser-runtime
 * All generated artifacts and the temporary Chrome profile are retained.
 */
import assert from "node:assert/strict";
import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
const require = createRequire(import.meta.url);
const { build } = require("esbuild");
const sharp = require("sharp");
const { chromium } = createRequire(join(resolve(process.argv[2]), "package.json"))("playwright");
const repo = process.cwd();
const scratch = await mkdtemp(join(tmpdir(), "whytho-account-browser-check."));
const harness = `
import React from 'react'; import {createRoot} from 'react-dom/client';
import {TeamManager} from ${JSON.stringify(join(repo,'components/dashboard/team-manager.tsx'))};
import {DisconnectButton} from ${JSON.stringify(join(repo,'components/dashboard/disconnect-button.tsx'))};
import {AnswerEditButton} from ${JSON.stringify(join(repo,'components/dashboard/answer-edit-button.tsx'))};
import {DraftApproveButton} from ${JSON.stringify(join(repo,'components/dashboard/draft-approve-button.tsx'))};
import {AnswerComposer} from ${JSON.stringify(join(repo,'components/answers/answer-composer.tsx'))};
import {ProfileEditor} from ${JSON.stringify(join(repo,'components/dashboard/profile-editor.tsx'))};
const params=new URLSearchParams(location.search), role=params.get('role')||'admin', verified=params.get('tier')!=='1';
const pol='33333333-3333-4333-8333-333333333333', answer='55555555-5555-4555-8555-555555555555';
createRoot(document.getElementById('app')).render(<main><h1>{role} component persona</h1>
<TeamManager politicianId={pol} callerRole={role}/>
{role==='admin'&&verified&&<ProfileEditor politicianId={pol} currentPhotoUrl={null} currentWebsiteUrl='https://example.gov' currentBio='Fixture biography'/>}
<DisconnectButton politicianId={pol} politicianName='Fixture Person' isOnlyAdmin={params.get('onlyAdmin')==='1'}/>
<section aria-label='Existing private draft'><AnswerEditButton answerId={answer} initialBody='A private response ready to edit.' createdAt='2020-01-01T00:00:00Z' isDraft/>
{verified&&role!=='responder'&&<DraftApproveButton answerId={answer}/>}</section>
<section aria-label='New answer'><AnswerComposer questionId='44444444-4444-4444-8444-444444444444' questionBody='How will you report progress publicly?' politicianSlug='fixture-person' politicianName='Fixture Person' isAdmin={role==='admin'} profileVerified={verified} canPublish={verified&&role!=='responder'}/></section></main>);
`;
await writeFile(join(scratch,"entry.tsx"),harness);
await build({entryPoints:[join(scratch,"entry.tsx")],bundle:true,outfile:join(scratch,"app.js"),platform:"browser",format:"iife",jsx:"automatic",absWorkingDir:repo,tsconfig:join(repo,"tsconfig.json"),nodePaths:[join(repo,"node_modules")],plugins:[{name:"test-router",setup(b){b.onResolve({filter:/^next\/navigation$/},()=>({path:"router",namespace:"test"}));b.onLoad({filter:/.*/,namespace:"test"},()=>({contents:"export const useRouter=()=>({refresh(){window.dispatchEvent(new Event('fixture-refresh'))},replace(){},push(){}});",loader:"js"}));}}]});
const html='<!doctype html><html><head><meta charset="utf-8"><link rel="stylesheet" href="/app.css"><style>:root{--color-ink:#111;--color-paper:#fff}body{color:#111;background:#fff;font:16px Arial;margin:20px}main{max-width:850px}section{margin-block:16px;padding:12px;border:1px solid #bbb}button,input,textarea,select{margin:6px;padding:8px}button{cursor:pointer}textarea{display:block;width:90%}</style></head><body><div id="app"></div><script src="/app.js"></script></body></html>';
const server=createServer(async(req,res)=>{try{if(req.url?.startsWith('/app.')){const name=req.url.split('?')[0].slice(1);res.setHeader('Content-Type',name.endsWith('.js')?'text/javascript':'text/css');res.end(await readFile(join(scratch,name)));}else{res.setHeader('Content-Type','text/html');res.end(html);}}catch{res.writeHead(404);res.end();}});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin=`http://127.0.0.1:${server.address().port}`;
const context=await chromium.launchPersistentContext(join(scratch,'chrome-profile'),{headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',viewport:{width:1100,height:900}});
const results=[]; const errors=[];
async function persona({role='admin',tier='2',onlyAdmin=false,failTeam=false,rejectAnswer=false,ambiguousAnswer=false}={}){
  const page=await context.newPage(); page.on('pageerror',err=>errors.push(err.message));
  const calls=[];
  let teamFailed=false;
  let members=[{id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',user_id:'11111111-1111-4111-8111-111111111111',role,display_name:'Team Admin',email:'admin@example.test',is_self:true},{id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',user_id:'22222222-2222-4222-8222-222222222222',role:'responder',display_name:'Draft Writer',email:role==='admin'?'writer@example.test':'',is_self:false}];
  await page.route('**/*',async route=>{
    const req=route.request(), url=new URL(req.url());
    if(url.origin!==origin){await route.abort();return;}
    if(!url.pathname.startsWith('/api/')){await route.continue();return;}
    let body={};try{body=req.postDataJSON()??{};}catch{}
    calls.push({path:url.pathname,method:req.method(),body,raw:req.postData()});
    let status=200,data={success:true};
    if(url.pathname==='/api/dashboard/team'){
      if(req.method()==='GET') {if(failTeam&&!teamFailed){teamFailed=true;status=503;data={error:'Unavailable'};}else data={members,caller_role:role};}
      else if(req.method()==='PATCH'){const member=members.find(m=>m.id===body.team_member_id);if(onlyAdmin&&member?.is_self&&body.role!=='admin'){status=422;data={error:'Add another admin before leaving'};}else if(member)member.role=body.role;}
      else if(req.method()==='POST'){status=201;data={success:true,email:body.email};members.push({id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',user_id:'new',role:body.role,display_name:null,email:body.email,is_self:false});}
      else if(req.method()==='DELETE')members=members.filter(m=>m.id!==body.team_member_id);
    }else if(url.pathname==='/api/answers'){
      status=rejectAnswer?403:201;
      data=rejectAnswer?{error:'Your team access has been removed.'}:ambiguousAnswer?{success:true}:{success:true,answer_id:'55555555-5555-4555-8555-555555555555',is_draft:role==='responder'||tier==='1'||body.answer_type==='team_statement'};
    }else if(url.pathname==='/api/dashboard/photo')data={success:true,photo_url:null};
    await route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  });
  await page.goto(`${origin}/?role=${role}&tier=${tier}&onlyAdmin=${onlyAdmin?'1':'0'}`);
  return {page,calls};
}
async function check(name,fn){const start=Date.now();try{await fn();results.push({name,status:'passed',duration_ms:Date.now()-start});}catch(error){results.push({name,status:'failed',error:String(error)});throw error;}}
try{
  await check('Admin changes staff roles, adds and removes a member',async()=>{
    const {page,calls}=await persona();await page.getByRole('button',{name:'Manage your team'}).click();
    await page.getByLabel('Role for Draft Writer').selectOption('editor');
    await page.getByLabel('Account email').fill('new@example.test');await page.getByLabel('Team role',{exact:true}).selectOption('responder');await page.getByRole('button',{name:'Add member',exact:true}).click();
    await page.getByText('new@example.test added as responder').waitFor();await page.getByRole('button',{name:'Remove Draft Writer from the team'}).click();
    await page.getByLabel('Role for Draft Writer').waitFor({state:'detached'});
    assert.ok(calls.some(c=>c.method==='PATCH'&&c.body.role==='editor'));assert.ok(calls.some(c=>c.method==='DELETE'));
    await page.screenshot({path:join(scratch,'admin-team.png'),fullPage:true});await page.close();
  });
  await check('Team read failure shows retry and recovers',async()=>{
    const {page}=await persona({failTeam:true});await page.getByRole('button',{name:'Manage your team'}).click();await page.getByRole('button',{name:'Retry team'}).click();await page.getByLabel('Role for Draft Writer').waitFor();await page.close();
  });
  await check('Responder edits an old own draft and saves a new private draft',async()=>{
    const {page,calls}=await persona({role:'responder'});await page.getByRole('button',{name:'Manage your team'}).click();
    assert.equal(await page.getByLabel('Role for Draft Writer').count(),0);assert.equal(await page.getByRole('button',{name:'Edit public profile'}).count(),0);
    await page.getByRole('button',{name:'Edit draft',exact:true}).click();await page.getByLabel('Edit your response').fill('An updated response prepared for approval.');await page.getByRole('button',{name:'Save',exact:true}).click();await page.getByText('✓ Edited').waitFor();
    await page.getByRole('button',{name:'+ Prepare a private draft',exact:true}).click();await page.getByPlaceholder('Write your answer here. Be clear, specific, and honest.').fill('A response to the question for private review.');await page.getByRole('button',{name:'Save private draft',exact:true}).click();await page.getByText('Draft saved', {exact:false}).first().waitFor();
    assert.ok(calls.some(c=>c.method==='PATCH'&&c.body.body==='An updated response prepared for approval.'));assert.equal(await page.getByRole('link',{name:'Share on X'}).count(),0);
    await page.screenshot({path:join(scratch,'responder-draft.png'),fullPage:true});await page.close();
  });
  await check('Verified editor deliberately saves privately and can approve a draft',async()=>{
    const {page,calls}=await persona({role:'editor'});await page.getByRole('button',{name:'Approve and Publish',exact:true}).click();await page.getByText('✓ Published',{exact:true}).waitFor();
    await page.getByRole('button',{name:'+ Write a response to this question',exact:true}).click();await page.getByPlaceholder('Write your answer here. Be clear, specific, and honest.').fill('An editor draft saved before public release.');await page.getByRole('button',{name:'Save private draft',exact:true}).click();await page.getByText('Draft saved',{exact:false}).first().waitFor();assert.ok(calls.some(c=>c.path==='/api/answers'&&c.body.answer_type==='team_statement'));await page.close();
  });
  await check('Verified editor publishes and sees confirmed share controls',async()=>{
    const {page}=await persona({role:'editor'});await page.getByRole('button',{name:'+ Write a response to this question',exact:true}).click();await page.getByPlaceholder('Write your answer here. Be clear, specific, and honest.').fill('A verified response published by the editor.');await page.getByRole('button',{name:'Publish response',exact:true}).click();await page.getByRole('link',{name:'Share on X'}).waitFor();await page.close();
  });
  await check('Pending admin remains in private draft flow',async()=>{
    const {page}=await persona({tier:'1'});assert.equal(await page.getByRole('button',{name:'Approve and Publish',exact:true}).count(),0);assert.equal(await page.getByRole('button',{name:'Edit public profile'}).count(),0);await page.getByRole('button',{name:'+ Prepare a private draft',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Publish response',exact:true}).count(),0);await page.close();
  });
  await check('Last admin is prevented from leaving; an editor can leave',async()=>{
    const {page}=await persona({onlyAdmin:true});await page.getByRole('button',{name:'Remove this profile from my dashboard',exact:true}).click();assert.equal(await page.getByRole('button',{name:'Yes, remove profile',exact:true}).isDisabled(),true);await page.close();
    const second=await persona({role:'editor'});await second.page.getByRole('button',{name:'Remove this profile from my dashboard',exact:true}).click();await second.page.getByRole('button',{name:'Yes, remove profile',exact:true}).click();await second.page.waitForTimeout(50);assert.ok(second.calls.some(c=>c.path==='/api/dashboard/disconnect'&&c.method==='DELETE'));await second.page.close();
  });
  await check('Admin photo picker requires permission and credit before upload',async()=>{
    const {page,calls}=await persona();await page.getByRole('button',{name:'Edit public profile'}).click();
    const png=await sharp({create:{width:400,height:500,channels:3,background:'#aabbcc'}}).png().toBuffer();
    await page.getByLabel('Choose photo',{exact:true}).setInputFiles({name:'fixture.png',mimeType:'image/png',buffer:png});
    const save=page.getByRole('button',{name:'Save profile photo',exact:true});assert.equal(await save.isDisabled(),true);
    await page.getByLabel('Photographer or copyright holder',{exact:true}).fill('Fixture Photographer');await page.getByRole('checkbox').check();await save.click();await page.getByText('Your profile photo is saved.',{exact:true}).waitFor();
    const call=calls.find(c=>c.path==='/api/dashboard/photo');assert.ok(call?.raw?.includes('rights_confirmed'));assert.ok(call?.raw?.includes('Fixture Photographer'));await page.close();
  });
  await check('Revoked access and ambiguous publication do not show success',async()=>{
    for(const config of [{rejectAnswer:true},{ambiguousAnswer:true}]){
      const {page}=await persona({role:'editor',...config});await page.getByRole('button',{name:'+ Write a response to this question',exact:true}).click();await page.getByPlaceholder('Write your answer here. Be clear, specific, and honest.').fill('A response whose publication must be confirmed.');await page.getByRole('button',{name:'Publish response',exact:true}).click();
      if(config.rejectAnswer)await page.getByText('Your team access has been removed.',{exact:true}).waitFor();else await page.getByRole('button',{name:'Refresh to check status',exact:true}).waitFor();assert.equal(await page.getByRole('link',{name:'Share on X'}).count(),0);await page.close();
    }
  });
  assert.deepEqual(errors,[],'Unexpected browser exceptions');
}finally{
  await writeFile(join(scratch,'results.json'),JSON.stringify({scope:'Real Chrome component interactions; mocked HTTP/auth/router; not provider E2E',checked_at:new Date().toISOString(),results,browser_errors:errors},null,2));
  await context.close();await new Promise(resolve=>server.close(resolve));
  console.log(JSON.stringify({scratch,passed:results.filter(r=>r.status==='passed').length,total:results.length,results},null,2));
}
