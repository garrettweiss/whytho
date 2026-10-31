/** Executes real verification route modules with only external boundaries mocked. */
import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";
const realRequire = createRequire(import.meta.url);
const politician = "10000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000001";
type Row = Record<string, unknown>;
function fixture() {
  const state = {
    user: { id: userId, is_anonymous: false } as { id: string; is_anonymous: boolean } | null,
    role: "admin", source: { official_website_url: "https://office.senate.gov", government_email_domains: ["office.senate.gov"], evidence_url: "https://senate.gov/directory" } as Row | null,
    limit: "allowed", sent: [] as Row[], inserted: [] as Row[], updates: [] as Row[], mailError: false,
    record: null as Row | null, fetched: [] as string[], metaCode: "wt-0123456789abcdef0123456789abcdef",
  };
  class Query implements PromiseLike<{ data: unknown; error: null }> {
    operation = "read"; value: Row | null = null;
    constructor(readonly table: string) {}
    select() { return this; } eq() { return this; } gt() { return this; } order() { return this; } limit() { return this; }
    single() { return this; } maybeSingle() { return this; }
    insert(value: Row) { this.operation = "insert"; this.value = value; return this; }
    update(value: Row) { this.operation = "update"; this.value = value; return this; }
    then<T = { data: unknown; error: null }, R = never>(resolve?: ((value: { data: unknown; error: null }) => T | PromiseLike<T>) | null, reject?: ((reason: unknown) => R | PromiseLike<R>) | null): PromiseLike<T | R> {
      let data: unknown;
      if (this.operation === "insert") { state.inserted.push(this.value!); data = null; }
      else if (this.operation === "update") { state.updates.push(this.value!); data = { id: "verification" }; }
      else data = this.table === "politician_team" ? { role: state.role } : state.record;
      return Promise.resolve({ data, error: null }).then(resolve, reject);
    }
  }
  const stubs: Record<string, unknown> = {
    "@/lib/supabase/server": { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.user } }) } }), createAdminClient: () => ({ from: (table: string) => new Query(table) }) },
    "@/lib/security/durable-rate-limit": { durableRateLimit: async () => state.limit, rateLimitKey: (scope: string, subject: string) => `${scope}:${subject}` },
    "@/lib/security/verification": { reviewedSource: async () => state.source, permittedGovernmentEmail: (email: string, domains: string[]) => domains.includes(email.split("@")[1]!), fetchOfficialMetaTag: async (url: string) => { state.fetched.push(url); return state.metaCode; } },
    "@/lib/email/resend": { FROM_EMAIL: "fixture@example.test", getResend: () => ({ emails: { send: async (message: Row) => { state.sent.push(message); return { error: state.mailError ? { message: "provider rejected" } : null }; } } }) },
  };
  function load(relative: string): { POST(request: Request): Promise<Response> } {
    const file = resolve(relative);
    const js = ts.transpileModule(readFileSync(file,"utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
    const compiledModule = { exports: {} };
    const evaluate = runInThisContext(`(function(require,module,exports){${js}\n})`,{filename:file}) as (require: (id:string)=>unknown,module: {exports:object},exports:object)=>void;
    evaluate(id => id in stubs ? stubs[id] : realRequire(id),compiledModule,compiledModule.exports);
    return compiledModule.exports as { POST(request: Request): Promise<Response> };
  }
  const request=(body: Row)=>new Request("https://whytho.us/api/verify/fixture",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({politician_id:politician,...body})});
  return {state,load,request};
}

test("visitor, anonymous and responder cannot initiate politician verification", async () => {
  for (const persona of ["visitor","anonymous","responder"]) {
    const f=fixture();if(persona==="visitor")f.state.user=null;else if(persona==="anonymous")f.state.user!.is_anonymous=true;else f.state.role="responder";
    const res=await f.load("app/api/verify/gov-email/route.ts").POST(f.request({action:"request",email:"staff@office.senate.gov"}));
    assert.equal(res.status,persona==="responder"?403:401);assert.equal(f.state.sent.length,0);assert.equal(f.state.inserted.length,0);
  }
});
test("a generic .gov address and an unreviewed profile do not establish authority", async () => {
  const f=fixture();const handler=f.load("app/api/verify/gov-email/route.ts");
  assert.equal((await handler.POST(f.request({action:"request",email:"staff@unrelated.gov"}))).status,422);
  f.state.source=null;
  assert.equal((await handler.POST(f.request({action:"request",email:"staff@office.senate.gov"}))).status,422);
  assert.equal(f.state.sent.length,0);
});
test("approved office OTP has a cryptographic six-digit code, expiry and no response disclosure", async () => {
  const f=fixture();const res=await f.load("app/api/verify/gov-email/route.ts").POST(f.request({action:"request",email:"staff@office.senate.gov"}));
  assert.equal(res.status,200);assert.equal(f.state.sent.length,1);
  const row=f.state.inserted[0]!;assert.match(String(row.verification_code),/^\d{6}$/);assert.ok(Date.parse(String(row.code_expires_at))>Date.now());
  assert.equal((await res.text()).includes(String(row.verification_code)),false);
});
test("verification rate store and mail delivery fail closed", async () => {
  for (const limit of ["limited","unavailable"]) {
    const f=fixture();f.state.limit=limit;
    const res=await f.load("app/api/verify/gov-email/route.ts").POST(f.request({action:"request",email:"staff@office.senate.gov"}));
    assert.equal(res.status,limit==="limited"?429:503);assert.equal(f.state.sent.length,0);
  }
  const f=fixture();f.state.mailError=true;
  assert.equal((await f.load("app/api/verify/gov-email/route.ts").POST(f.request({action:"request",email:"staff@office.senate.gov"}))).status,503);
});
test("expired, wrong and exhausted OTPs cannot complete verification", async () => {
  const f=fixture();f.state.record={id:"v1",status:"pending",verification_code:"123456",code_expires_at:new Date(Date.now()+60000).toISOString(),metadata:{email:"staff@office.senate.gov",assurance:"reviewed_source_v1",source_url:"https://senate.gov/directory"}};
  const handler=f.load("app/api/verify/gov-email/route.ts");
  assert.equal((await handler.POST(f.request({action:"confirm",code:"999999"}))).status,422);
  f.state.limit="limited";assert.equal((await handler.POST(f.request({action:"confirm",code:"123456"}))).status,429);
  f.state.limit="allowed";f.state.record.code_expires_at="2000-01-01T00:00:00Z";
  assert.equal((await handler.POST(f.request({action:"confirm",code:"123456"}))).status,422);assert.equal(f.state.updates.length,0);
});
test("successful OTP completion clears secret and expiry", async () => {
  const f=fixture();f.state.record={id:"v1",status:"pending",verification_code:"123456",code_expires_at:new Date(Date.now()+60000).toISOString(),metadata:{email:"staff@office.senate.gov",assurance:"reviewed_source_v1",source_url:"https://senate.gov/directory"}};
  assert.equal((await f.load("app/api/verify/gov-email/route.ts").POST(f.request({action:"confirm",code:"123456"}))).status,200);
  assert.equal(f.state.updates[0]?.verification_code,null);assert.equal(f.state.updates[0]?.code_expires_at,null);
});
test("meta verification fetches only the reviewed URL, ignores claimant input", async () => {
  const f=fixture();f.state.record={id:"v1",status:"pending",verification_code:f.state.metaCode,metadata:{website_url:"https://office.senate.gov",assurance:"reviewed_source_v1",source_url:"https://senate.gov/directory"}};
  const response=await f.load("app/api/verify/meta-tag/route.ts").POST(f.request({action:"check",website_url:"https://attacker.example"}));
  assert.equal(response.status,200);assert.deepEqual(f.state.fetched,["https://office.senate.gov"]);
});
test("old claimant-defined verification cannot resume against a reviewed source", async () => {
  const f=fixture();f.state.record={id:"v1",status:"completed",verification_code:f.state.metaCode,metadata:{website_url:"https://attacker.example"}};
  assert.equal((await f.load("app/api/verify/meta-tag/route.ts").POST(f.request({action:"check"}))).status,422);assert.equal(f.state.fetched.length,0);
});


test("source review changes invalidate pending and completed email proofs", async () => {
  for (const status of ["pending", "completed"]) {
    const f=fixture();
    f.state.record={id:"v1",status,verification_code:"123456",code_expires_at:new Date(Date.now()+60000).toISOString(),metadata:{email:"staff@office.senate.gov",assurance:"reviewed_source_v1",source_url:"https://senate.gov/old-directory"}};
    const response=await f.load("app/api/verify/gov-email/route.ts").POST(f.request({action:"confirm",code:"123456"}));
    assert.equal(response.status,422);assert.equal(f.state.updates.length,0);
    assert.equal((await response.json()).already_verified,undefined);
  }
});
test("meta proof cannot resume after its reviewed evidence changes", async () => {
  for (const status of ["pending", "completed"]) {
    const f=fixture();
    f.state.record={id:"v1",status,verification_code:f.state.metaCode,metadata:{website_url:"https://office.senate.gov",assurance:"reviewed_source_v1",source_url:"https://senate.gov/old-directory"}};
    const handler=f.load("app/api/verify/meta-tag/route.ts");
    assert.equal((await handler.POST(f.request({action:"check"}))).status,422);
    assert.equal(f.state.fetched.length,0);assert.equal(f.state.updates.length,0);
    const regenerated=await handler.POST(f.request({action:"generate"}));
    assert.equal(regenerated.status,200);assert.equal(f.state.inserted.length,1);
    const result=await regenerated.json();assert.notEqual(result.code,f.state.metaCode);
    assert.equal((f.state.inserted[0]?.metadata as Row).source_url,"https://senate.gov/directory");
  }
});
