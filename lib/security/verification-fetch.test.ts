/** Exercise the real fetcher; only DNS, HTTPS transport and its clock are mocked. */
import assert from "node:assert/strict";
import test from "node:test";
import { EventEmitter } from "node:events";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import * as publicUrl from "./public-url";

function fetchFixture() {
  let now=0;
  let nextTimer=0;
  const timers=new Map<number,{due:number;callback:()=>void}>();
  const setTimer=(callback:()=>void,delay:number)=>{
    const id=++nextTimer;timers.set(id,{due:now+delay,callback});return id;
  };
  const advance=(milliseconds:number)=>{
    const target=now+milliseconds;
    for (;;) {
      const next=[...timers].sort((a,b)=>a[1].due-b[1].due)[0];
      if (!next || next[1].due>target) break;
      now=next[1].due;timers.delete(next[0]);next[1].callback();
    }
    now=target;
  };
  let resolveDns!: (addresses:{address:string;family:number}[])=>void;
  const dns=new Promise<{address:string;family:number}[]>(resolve=>{resolveDns=resolve;});
  class ResponseStream extends EventEmitter {
    statusCode=200;
    headers:Record<string,string>={"content-type":"text/html"};
    destroyed=false;
    destroy(){this.destroyed=true;return this;}
  }
  class RequestStream extends EventEmitter {
    destroyed=false;
    destroy(){this.destroyed=true;return this;}
    end(){return this;}
  }
  const response=new ResponseStream();
  const request=new RequestStream();
  let requests=0;
  let receiveResponse!: (value:ResponseStream)=>void;
  const stubs:Record<string,unknown>={
    "node:dns/promises":{lookup:()=>dns},
    "node:https":{request:(_url:URL,options:{family:number;autoSelectFamily:boolean},receive:(value:ResponseStream)=>void)=>{
      assert.equal(options.family,4);assert.equal(options.autoSelectFamily,false);
      requests++;receiveResponse=receive;return request;
    }},
    "./public-url":publicUrl,
    "@/lib/supabase/server":{},
  };
  const file=resolve("lib/security/verification.ts");
  const js=ts.transpileModule(readFileSync(file,"utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const compiledModule={exports:{}};
  const evaluate=runInThisContext(`(function(require,module,exports,setTimeout,clearTimeout){${js}\n})`,{filename:file}) as (
    require:(id:string)=>unknown, compiledModule:{exports:object}, exports:object,
    setTimeout:typeof setTimer,clearTimeout:(id:number)=>void,
  )=>void;
  evaluate(id=>{
    if (!(id in stubs)) throw new Error(`Unexpected dependency: ${id}`);
    return stubs[id];
  },compiledModule,compiledModule.exports,setTimer,id=>{timers.delete(id);});
  const {fetchOfficialMetaTag}=compiledModule.exports as {fetchOfficialMetaTag:(url:string)=>Promise<string|null>};
  return {
    fetch:()=>fetchOfficialMetaTag("https://office.senate.gov"),
    advance,response,request,timers,
    requests:()=>requests,
    resolveDns:async()=>{resolveDns([{address:"8.8.8.8",family:4}]);await Promise.resolve();},
    deliver:()=>receiveResponse(response),
  };
}

test("verification deadline includes DNS and late DNS cannot open a connection",async()=>{
  const f=fetchFixture();
  const result=f.fetch();
  assert.equal(f.timers.size,1,"overall deadline must start before DNS completes");
  f.advance(8000);
  assert.equal(await result,null);
  await f.resolveDns();
  assert.equal(f.requests(),0);assert.equal(f.timers.size,0);
});

test("a continuously trickling verification body is aborted at the total deadline",async()=>{
  const f=fetchFixture();
  let settled=false;
  const result=f.fetch().then(value=>{settled=true;return value;});
  await f.resolveDns();f.deliver();
  assert.equal(f.timers.size,1);
  f.response.emit("data",Buffer.from("<head>"));
  for(let second=0;second<7;second++){
    f.advance(1000);f.response.emit("data",Buffer.from(" "));
  }
  // No socket inactivity event is emitted: the stream is still producing data.
  f.advance(999);await Promise.resolve();assert.equal(settled,false);
  f.advance(1);
  assert.equal(await result,null);
  assert.equal(f.request.destroyed,true);assert.equal(f.response.destroyed,true);
  assert.equal(f.timers.size,0);
});

test("completed HTML clears the deadline and redirects are refused without another request",async()=>{
  const code="wt-0123456789abcdef0123456789abcdef";
  for(const status of [200,302]){
    const f=fetchFixture();const result=f.fetch();
    await f.resolveDns();
    f.response.statusCode=status;f.response.headers.location="https://other.senate.gov";
    f.deliver();
    if(status===200)f.response.emit("data",Buffer.from(`<head><meta name="whytho-verification" content="${code}"></head>`));
    assert.equal(await result,status===200?code:null);
    assert.equal(f.timers.size,0);assert.equal(f.request.destroyed,true);assert.equal(f.response.destroyed,true);
    assert.equal(f.requests(),1);
  }
});
