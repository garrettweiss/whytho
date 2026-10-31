/**
 * Offline integration tests for actual route and server-page modules.
 * Only external boundaries are replaced. No credentials, environment files,
 * live authentication, email, storage, or database connections are used.
 * Run: npx tsx --test scripts/release-integration.test.ts
 */
import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createRequire } from "node:module";
import { runInThisContext } from "node:vm";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const realRequire = createRequire(import.meta.url);
const root = process.cwd();
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error("Network is forbidden in release integration tests"); };
after(() => { globalThis.fetch = originalFetch; });

type Row = Record<string, unknown>;
type User = { id: string; email: string; is_anonymous?: boolean; created_at?: string };
type QueryLog = { table: string; client: "user" | "admin"; operation: string; fields: string; filters: [string, unknown][]; limit?: number };
const USER = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const POLITICIAN = "33333333-3333-4333-8333-333333333333";
const QUESTION = "44444444-4444-4444-8444-444444444444";
const ANSWER = "55555555-5555-4555-8555-555555555555";
const MEDIA = "66666666-6666-4666-8666-666666666666";
const signedIn: User = { id: USER, email: "member@example.test", created_at: "2020-01-01T00:00:00Z" };

class Redirect extends Error { constructor(readonly location: string) { super(location); } }

function fixture(options: { user?: User | null; role?: string; draft?: boolean; tier?: string; cookie?: string } = {}) {
  const user = options.user === undefined ? signedIn : options.user;
  const person = { id: POLITICIAN, slug: "fixture-person", full_name: "Fixture Person", verification_tier: options.tier ?? "2", office: "State Senate", state: "CA", party: null, photo_url: null, website_url: null, bio: null, social_handles: null };
  const data: Record<string, Row[]> = {
    politicians: [person],
    politician_team: options.role ? [{ user_id: USER, politician_id: POLITICIAN, role: options.role, politicians: person }] : [],
    questions: [{ id: QUESTION, politician_id: POLITICIAN, body: "Current user's question", submitted_by: USER, status: "active", net_upvotes: 12, week_number: 202644, is_seeded: false, created_at: "2026-10-30T12:00:00Z", answers: [], politicians: person }],
    answers: [], answer_media: [], votes: [],
    user_profiles: [{ id: USER, city: "Own City", county: null, state_code: "CA", political_affiliation: null }],
  };
  const logs: QueryLog[] = [];
  const uploads: { path: string; bytes: number }[] = [];
  const signs: { path: string; ttl: number }[] = [];
  const emails: unknown[] = [];
  const deniedReads = new Set<string>();
  const failedReads = new Set<string>();
  const thrownReads = new Set<string>();
  let attachmentRejected = false;
  let beforeAnswerUpdate: (() => void) | undefined;
  let adminClients = 0;

  class Query implements PromiseLike<{ data: unknown; error: { message: string } | null; count: number }> {
    log: QueryLog;
    private values: Row[] = [];
    private one = false;
    private head = false;
    private choices: [string, unknown[]][] = [];
    constructor(table: string, client: "user" | "admin") { this.log = { table, client, operation: "read", fields: "*", filters: [] }; }
    select(fields = "*", opts?: { head?: boolean }) { this.log.fields = fields; this.head = opts?.head ?? false; return this; }
    eq(key: string, value: unknown) { this.log.filters.push([key, value]); return this; }
    in(key: string, values: unknown[]) { this.choices.push([key, values]); return this; }
    order() { return this; }
    limit(count: number) { this.log.limit = count; return this; }
    abortSignal() { return this; }
    maybeSingle() { this.one = true; return this; }
    single() { this.one = true; return this; }
    insert(value: Row) { this.log.operation = "insert"; this.values = [{ id: ANSWER, ...value }]; return this; }
    update(value: Row) { this.log.operation = "update"; this.values = [value]; return this; }
    private execute() {
      logs.push(this.log);
      if (thrownReads.has(this.log.table)) throw new Error("Fixture transport failed");
      if (failedReads.has(this.log.table)) return { data: null, error: { message: "Fixture read failed" }, count: 0 };
      if (this.log.table === "answers" && this.log.operation === "update") { beforeAnswerUpdate?.(); beforeAnswerUpdate = undefined; }
      let rows = data[this.log.table] ?? [];
      if (this.log.client === "user" && deniedReads.has(this.log.table)) rows = [];
      rows = rows.filter(row => this.log.filters.every(([key, value]) => key.includes(".") || row[key] === value) && this.choices.every(([key, values]) => values.includes(row[key])));
      if (this.log.operation === "insert") { data[this.log.table] ??= []; data[this.log.table]!.push(...this.values); rows = this.values; }
      if (this.log.operation === "update") rows.forEach(row => Object.assign(row, this.values[0]));
      const count = rows.length;
      if (this.log.limit !== undefined) rows = rows.slice(0, this.log.limit);
      return { data: this.head ? null : this.one ? rows[0] ?? null : rows, error: null, count };
    }
    then<TResult1 = { data: unknown; error: { message: string } | null; count: number }, TResult2 = never>(
      onfulfilled?: ((value: { data: unknown; error: { message: string } | null; count: number }) => TResult1 | PromiseLike<TResult1>) | null,
      onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ): PromiseLike<TResult1 | TResult2> { return Promise.resolve(this.execute()).then(onfulfilled, onrejected); }
  }

  const client = (kind: "user" | "admin") => ({
    from: (table: string) => new Query(table, kind),
    rpc: (name: string, args?: Row) => {
      if (name === "current_week_number") return { abortSignal: async () => ({ data: 202644, error: null }) };
      assert.equal(name, "attach_answer_media"); assert.equal(kind, "admin");
      assert.ok(args); assert.equal(args.p_actor_id, USER);
      if (attachmentRejected) return Promise.resolve({ data: null, error: { code: "42501", message: "Fixture race rejection" } });
      data.answer_media!.push({ id: args.p_media_id, answer_id: args.p_answer_id, politician_id: POLITICIAN, storage_path: args.p_storage_path, media_type: args.p_media_type, public_url: args.p_public_url, file_name: args.p_file_name });
      return Promise.resolve({ data: args.p_media_id, error: null });
    },
    auth: { getUser: async () => ({ data: { user }, error: null }), exchangeCodeForSession: async () => ({ data: { user }, error: null }), admin: { getUserById: async () => ({ data: { user: null }, error: null }) } },
    storage: { from: (bucket: string) => {
      assert.equal(bucket, "answer-media");
      return {
        upload: async (path: string, bytes: ArrayBuffer) => { uploads.push({ path, bytes: bytes.byteLength }); return { error: null }; },
        remove: async () => ({ error: null }),
        createSignedUrl: async (path: string, ttl: number) => { signs.push({ path, ttl }); return { data: { signedUrl: `https://storage.example.test/private/${path}?token=fixture` }, error: null }; },
      };
    } },
  });

  const visual = (name: string) => (props: Record<string, unknown> & { children?: React.ReactNode }) => React.createElement("div", { "data-component": name, "data-props": JSON.stringify(Object.fromEntries(Object.entries(props).filter(([key]) => key !== "children"))) }, props.children);
  const stubs: Record<string, unknown> = {
    "@/lib/supabase/server": { createClient: async () => client("user"), createAdminClient: () => { adminClients++; return client("admin"); }, createPublicClient: () => { throw new Error("Private flow attempted public client"); } },
    "next/navigation": { redirect: (path: string) => { throw new Redirect(path); }, notFound: () => { throw new Error("Not found"); } },
    "next/headers": { cookies: async () => ({ get: () => options.cookie ? { value: options.cookie } : undefined }) },
    "next/link": { __esModule: true, default: ({ children, ...props }: { children?: React.ReactNode }) => React.createElement("a", props, children) },
    "@/lib/email/resend": { FROM_EMAIL: "offline@example.test", getResend: () => ({ emails: { send: async (email: unknown) => { emails.push(email); } } }) },
    "@/lib/email/templates": { answerNotificationEmail: () => ({}), draftAnswerNotificationEmail: () => ({}) },
  };
  for (const [path, name] of [
    ["public/public-layout", "PublicPage"], ["auth/sign-in-form", "SignInForm"], ["account/account-profile-form", "AccountProfileForm"],
    ["dashboard/dashboard-shell", "DashboardShell"], ["dashboard/team-manager", "TeamManager"], ["dashboard/profile-editor", "ProfileEditor"],
    ["dashboard/disconnect-button", "DisconnectButton"], ["dashboard/draft-approve-button", "DraftApproveButton"], ["dashboard/question-inbox", "DashboardQuestionInbox"],
    ["verify/verify-wizard", "VerifyWizard"],
  ] as const) stubs[`@/components/${path}`] = { [name]: visual(name) };

  const modules = new Map<string, { exports: Record<string, unknown> }>();
  function load<T>(relative: string): T {
    const filename = resolve(root, relative);
    const cached = modules.get(filename);
    if (cached) return cached.exports as T;
    const compiled = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true }, fileName: filename }).outputText;
    const module = { exports: {} };
    modules.set(filename, module);
    const localRequire = (specifier: string): unknown => {
      if (specifier in stubs) return stubs[specifier];
      if (specifier.endsWith(".css")) return { __esModule: true, default: new Proxy({}, { get: (_target, key) => String(key) }) };
      if (specifier.startsWith("@/") || specifier.startsWith(".")) {
        const base = specifier.startsWith("@/") ? resolve(root, specifier.slice(2)) : resolve(dirname(filename), specifier);
        const target = [base, `${base}.ts`, `${base}.tsx`].find(candidate => existsSync(candidate));
        assert.ok(target, `Missing source module: ${specifier}`);
        return load(target);
      }
      if (["http", "https", "net", "tls", "node:http", "node:https", "node:net", "node:tls"].includes(specifier)) throw new Error("Network module forbidden");
      return realRequire(specifier);
    };
    const run = runInThisContext(`(function(require,module,exports){${compiled}\n})`, { filename }) as (require: (specifier: string) => unknown, module: { exports: object }, exports: object) => void;
    run(localRequire, module, module.exports);
    return module.exports as T;
  }
  function addAnswer(overrides: Row = {}) {
    const answer: Row = { id: ANSWER, politician_id: POLITICIAN, question_id: QUESTION, is_draft: options.draft ?? true, is_ai_generated: false, answer_type: "team_statement", published_by: USER, body: "A draft response for review.", created_at: "2026-10-30T12:00:00Z", questions: { body: "A fixture question" }, answer_media: [], ...overrides };
    data.answers!.push(answer); return answer;
  }
  function addMedia() {
    const media = { id: MEDIA, answer_id: ANSWER, politician_id: POLITICIAN, storage_path: `${POLITICIAN}/${ANSWER}/fixture.png`, public_url: `/api/answer-media/${MEDIA}`, media_type: "image", file_name: "fixture.png" };
    data.answer_media!.push(media); return media;
  }
  return { data, user, logs, uploads, signs, emails, deniedReads, failedReads, thrownReads, load, addAnswer, addMedia, rejectAttachment: () => { attachmentRejected = true; }, beforeAnswerUpdate: (fn: () => void) => { beforeAnswerUpdate = fn; }, adminClients: () => adminClients };
}

type Route = { POST: (request: Request, context?: { params: Promise<{ id: string }> }) => Promise<Response>; GET: (request: Request, context?: { params: Promise<{ id: string }> }) => Promise<Response>; PATCH: (request: Request, context?: { params: Promise<{ id: string }> }) => Promise<Response> };
type Page = { default: (props?: { searchParams: Promise<Record<string, string>> }) => Promise<React.ReactElement> };
const context = (id = ANSWER) => ({ params: Promise.resolve({ id }) });
const jsonRequest = (body: Row) => new Request("https://whytho.example.test/api/answers", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
function fileRequest(type = "image/png") { const form = new FormData(); form.append("file", new File(["offline image fixture"], "../../unsafe.html", { type })); return new Request("https://whytho.example.test/api/answers/media", { method: "POST", body: form }); }
const mediaRequest = () => new Request(`https://whytho.example.test/api/answer-media/${MEDIA}`);
const markup = async (f: ReturnType<typeof fixture>, path: string, params: Record<string, string> = {}) => renderToStaticMarkup(await f.load<Page>(path).default({ searchParams: Promise.resolve(params) }));

test("sign-in page and real callback preserve safe local return paths and reject open redirects", async () => {
  for (const next of ["//evil.test", "/\\evil.test", "https://evil.test", "/safe\nLocation:evil"]) {
    const f = fixture();
    const html = await markup(f, "app/(auth)/sign-in/page.tsx", { redirect: next });
    assert.match(html, /redirectAfter.*&quot;\/&quot;/);
    const res = await f.load<Route>("app/auth/callback/route.ts").GET(new Request(`https://whytho.example.test/auth/callback?code=fixture&next=${encodeURIComponent(next)}`));
    assert.equal(res.headers.get("location"), "https://whytho.example.test/");
  }
  const f = fixture({ user: { ...signedIn, created_at: new Date().toISOString() } });
  const res = await f.load<Route>("app/auth/callback/route.ts").GET(new Request("https://whytho.example.test/auth/callback?code=fixture&next=%2Faccount%3Ftab%3Dvotes%23recent"));
  assert.equal(res.headers.get("location"), "https://whytho.example.test/account?tab=votes&new_user=1#recent");
});

test("account gates anonymous sessions before querying private records", async () => {
  for (const user of [null, { ...signedIn, is_anonymous: true }]) {
    const f = fixture({ user });
    await assert.rejects(markup(f, "app/account/page.tsx", { tab: "votes" }), (error: unknown) => error instanceof Redirect && error.location === "/sign-in?redirect=%2Faccount%3Ftab%3Dvotes");
    assert.equal(f.logs.length, 0);
  }
});

test("account reads are bounded and user-scoped, with honest failures", async () => {
  const f = fixture();
  f.data.questions!.push({ ...f.data.questions![0], id: OTHER, body: "OTHER PRIVATE QUESTION", submitted_by: OTHER });
  f.data.votes!.push({ id: OTHER, user_id: OTHER, value: 1, questions: { body: "OTHER PRIVATE VOTE" } });
  const html = await markup(f, "app/account/page.tsx");
  assert.match(html, /Current user/); assert.doesNotMatch(html, /OTHER PRIVATE/);
  assert.equal(f.adminClients(), 0);
  assert.deepEqual(f.logs.find(log => log.table === "questions")?.filters, [["submitted_by", USER]]);
  assert.equal(f.logs.find(log => log.table === "questions")?.limit, 50);
  assert.deepEqual(f.logs.find(log => log.table === "votes")?.filters, [["user_id", USER]]);
  assert.equal(f.logs.find(log => log.table === "votes")?.limit, 100);
  f.failedReads.add("user_profiles");
  assert.match(await markup(f, "app/account/page.tsx", { tab: "profile" }), /could not load/);
});

test("dashboard role branches preserve claims, verification, draft review and admin-only controls", async () => {
  const noClaim = fixture(); assert.match(await markup(noClaim, "app/dashboard/page.tsx"), /Claim your profile/);
  for (const [role, tier] of [["admin", "2"], ["editor", "2"], ["editor", "1"], ["responder", "1"]]) {
    const f = fixture({ role, tier });
    const answer = f.addAnswer(); answer.answer_media = [f.addMedia()];
    const html = await markup(f, "app/dashboard/page.tsx");
    assert.match(html, tier === "2" ? /Verified/ : /Self-claimed/);
    assert.equal(html.includes('data-component="ProfileEditor"'), role === "admin");
    assert.equal(html.includes('data-component="DraftApproveButton"'), tier === "2" && role !== "responder");
    assert.match(html, new RegExp(`profileVerified&quot;:${tier === "2"}`));
    assert.equal(html.includes(`/api/answer-media/${MEDIA}`), role !== "responder");
    assert.equal(f.adminClients(), 0);
    assert.ok(f.logs.filter(log => log.table !== "politician_team").every(log => log.filters.some(([key, value]) => key === "politician_id" && value === POLITICIAN)));
  }
  const citizen = fixture({ role: "admin", cookie: "citizen" });
  await assert.rejects(markup(citizen, "app/dashboard/page.tsx"), (error: unknown) => error instanceof Redirect && error.location === "/");
});

test("answer route rejects anonymous/nonteam/direct responder requests without writes", async () => {
  for (const [opts, extra, status] of [[{ user: null }, {}, 401], [{}, {}, 403], [{ role: "responder" }, { answer_type: "direct" }, 403]] as const) {
    const f = fixture(opts);
    const res = await f.load<Route>("app/api/answers/route.ts").POST(jsonRequest({ question_id: QUESTION, body: "An answer long enough.", ...extra }));
    assert.equal(res.status, status); assert.equal(f.data.answers!.length, 0);
  }
});

test("verification reload restores only the current user's completed methods without exposing private codes", async () => {
  const f = fixture({ role: "admin", tier: "1" });
  f.data.politician_verifications = [
    { id: MEDIA, user_id: USER, politician_id: POLITICIAN, method: "gov_email", status: "completed", verification_code: "SECRET_CODE" },
    { id: OTHER, user_id: OTHER, politician_id: POLITICIAN, method: "meta_tag", status: "completed", verification_code: "OTHER_SECRET" },
  ];
  const html = await markup(f, "app/verify/page.tsx", { prefill: POLITICIAN });
  assert.match(html, /completedMethods.*gov_email/); assert.doesNotMatch(html, /SECRET_CODE|OTHER_SECRET|&quot;meta_tag&quot;/);
  assert.ok(f.logs.every(log => log.filters.some(([key, value]) => key === "user_id" && value === USER)));
  assert.equal(f.logs.filter(log => log.operation !== "read").length, 0); assert.equal(f.adminClients(), 0);
});

test("real answer response contract feeds authorized media upload for draft and publishing roles", async () => {
  for (const role of ["responder", "editor", "admin"]) {
    const f = fixture({ role }); f.data.questions![0]!.submitted_by = null;
    const res = await f.load<Route>("app/api/answers/route.ts").POST(jsonRequest({ question_id: QUESTION, body: "A substantive fixture response." }));
    assert.equal(res.status, 200);
    const parse = f.load<{ parseSavedAnswerResult: (value: unknown) => { answerId: string; isDraft: boolean } }>("components/answers/answer-result.ts").parseSavedAnswerResult;
    const result = parse(await res.json());
    assert.equal(result.answerId, ANSWER); assert.equal(result.isDraft, role === "responder");
    const upload = await f.load<Route>("app/api/answers/[id]/media/route.ts").POST(fileRequest(), context(result.answerId));
    assert.equal(upload.status, 201);
    const record = f.data.answer_media![0]!;
    assert.match(String(record.public_url), /^\/api\/answer-media\/[a-f0-9-]+$/);
    assert.equal(record.answer_id, result.answerId);
    assert.equal(f.uploads.length, 1); assert.match(f.uploads[0]!.path, new RegExp(`${ANSWER}/[a-f0-9-]+\\.png$`));
    assert.equal(f.signs.length, 0, "upload must not store a signed URL");
  }
});

test("media denies wrong ownership, published responder changes, AI, and unsupported types before storage", async () => {
  for (const [role, overrides, type, status] of [
    ["responder", { published_by: OTHER }, "image/png", 403], ["responder", { is_draft: false }, "image/png", 403],
    [undefined, {}, "image/png", 403], ["editor", { is_ai_generated: true }, "image/png", 422],
    ["admin", { answer_type: "ai_analysis" }, "image/png", 422], ["editor", {}, "text/html", 422],
  ] as const) {
    const f = fixture({ role }); f.addAnswer(overrides);
    const res = await f.load<Route>("app/api/answers/[id]/media/route.ts").POST(fileRequest(type), context());
    assert.equal(res.status, status); assert.equal(f.uploads.length, 0); assert.equal(f.data.answer_media!.length, 0);
  }
});

test("media delivery never signs an unreadable or unauthorized draft, even with permissive fixture reads", async () => {
  for (const opts of [{ user: null }, {}, { role: "responder" }]) {
    const f = fixture(opts); f.addAnswer({ published_by: OTHER }); f.addMedia();
    const res = await f.load<Route>("app/api/answer-media/[id]/route.ts").GET(mediaRequest(), context(MEDIA));
    assert.equal(res.status, 404); assert.equal(f.signs.length, 0); assert.equal(f.adminClients(), 0);
    assert.match(res.headers.get("cache-control") ?? "", /private, no-store/);
  }
  const f = fixture({ role: "admin" }); f.addAnswer(); f.addMedia(); f.deniedReads.add("answer_media");
  const res = await f.load<Route>("app/api/answer-media/[id]/route.ts").GET(mediaRequest(), context(MEDIA));
  assert.equal(res.status, 404); assert.equal(f.signs.length, 0);
});

test("media delivery signs only authorized matching paths with short expiry and no shared cache", async () => {
  for (const opts of [{ user: null, draft: false }, { role: "admin" }, { role: "editor" }, { role: "responder" }]) {
    const f = fixture(opts); f.addAnswer(); f.addMedia();
    const res = await f.load<Route>("app/api/answer-media/[id]/route.ts").GET(mediaRequest(), context(MEDIA));
    assert.equal(res.status, 307); assert.equal(f.signs.length, 1); assert.equal(f.signs[0]!.ttl, 60);
    assert.match(res.headers.get("location") ?? "", /^https:\/\/storage\.example\.test\/private\//);
    assert.match(res.headers.get("cache-control") ?? "", /private, no-store/); assert.equal(res.headers.get("vary"), "Cookie");
    assert.ok(f.logs.every(log => log.client === "user"));
  }
  const f = fixture({ role: "admin" }); f.addAnswer(); f.addMedia().storage_path = `${OTHER}/${ANSWER}/bad.png`;
  const res = await f.load<Route>("app/api/answer-media/[id]/route.ts").GET(mediaRequest(), context(MEDIA));
  assert.equal(res.status, 404); assert.equal(f.signs.length, 0);
});

test("approval is publishing-role only and changes draft visibility", async () => {
  for (const role of ["responder", "editor", "admin"]) {
    const f = fixture({ role }); const answer = f.addAnswer();
    const res = await f.load<Route>("app/api/answers/[id]/approve/route.ts").POST(jsonRequest({}), context());
    assert.equal(res.status, role === "responder" ? 403 : 200);
    assert.equal(answer.is_draft, role === "responder");
  }
});

test("upload uses atomic attachment guard and handles an approval or role change during transfer", async () => {
  const f = fixture({ role: "responder" }); f.addAnswer(); f.rejectAttachment();
  const res = await f.load<Route>("app/api/answers/[id]/media/route.ts").POST(fileRequest(), context());
  assert.equal(res.status, 409); assert.equal(f.uploads.length, 1); assert.equal(f.data.answer_media!.length, 0);
  assert.equal(f.logs.filter(log => log.table === "answer_media" && log.operation === "insert").length, 0);
});

test("media over the shared hosting limit is refused and delivery failures are private", async () => {
  const f = fixture({ role: "editor" }); f.addAnswer();
  const form = new FormData(); form.append("file", new File([new Uint8Array(4 * 1024 * 1024 + 1)], "too-large.png", { type: "image/png" }));
  const upload = await f.load<Route>("app/api/answers/[id]/media/route.ts").POST(new Request("https://whytho.example.test/api/answers/media", { method: "POST", body: form }), context());
  assert.equal(upload.status, 422); assert.equal(f.uploads.length, 0);
  for (const kind of ["error", "throw"]) {
    const g = fixture({ role: "admin" }); g.addAnswer(); g.addMedia();
    (kind === "error" ? g.failedReads : g.thrownReads).add("answer_media");
    const delivery = await g.load<Route>("app/api/answer-media/[id]/route.ts").GET(mediaRequest(), context(MEDIA));
    assert.equal(delivery.status, 503); assert.equal(g.signs.length, 0); assert.match(delivery.headers.get("cache-control") ?? "", /private, no-store/);
  }
});

test("controlled media URL survives public normalization and rendering while unsafe paths are discarded", () => {
  const f = fixture();
  const media = f.addMedia();
  const helpers = f.load<{ toPublicAnswers: (answers: Row[]) => { answer_media: typeof media[] }[] }>("lib/profile/helpers.ts");
  const answer = f.addAnswer({ is_draft: false, sources: [], answer_media: [media, ...["//evil.test", "/api/answer-media/../secret", "/api/answer-media/not-a-uuid", "javascript:alert(1)", "https://user:password@example.test/file"].map(public_url => ({ ...media, public_url }))] });
  const mapped = helpers.toPublicAnswers([answer]);
  assert.equal(mapped[0]!.answer_media.length, 1);
  const display = f.load<{ AnswerMediaDisplay: React.ComponentType<{ media: typeof media[] }> }>("components/answers/answer-media-display.tsx");
  const html = renderToStaticMarkup(React.createElement(display.AnswerMediaDisplay, { media: mapped[0]!.answer_media }));
  assert.match(html, new RegExp(`/api/answer-media/${MEDIA}`)); assert.doesNotMatch(html, /javascript|evil\.test|password/);
  assert.equal(helpers.toPublicAnswers([{ ...answer, is_draft: true }]).length, 0);
});

test("answer editing permits publishing roles and only a responder's own pending draft", async () => {
  for (const [role, draft] of [["admin", false], ["editor", false], ["editor", true], ["responder", true]] as const) {
    const f = fixture({ role });
    const answer = f.addAnswer({ is_draft: draft, created_at: new Date().toISOString() });
    const res = await f.load<Route>("app/api/answers/[id]/route.ts").PATCH(jsonRequest({ body: "A permitted edited response." }), context());
    assert.equal(res.status, 200); assert.equal(answer.body, "A permitted edited response.");
    const write = f.logs.find(log => log.operation === "update")!;
    assert.ok(write.filters.some(([key, value]) => key === "politician_id" && value === POLITICIAN));
    if (role === "responder") {
      assert.ok(write.filters.some(([key, value]) => key === "is_draft" && value === true));
      assert.ok(write.filters.some(([key, value]) => key === "published_by" && value === USER));
    }
  }
});

test("answer editing denies published or another responder's draft and preserves the edit window", async () => {
  for (const [role, overrides, expected] of [
    ["responder", { is_draft: false }, 403], ["responder", { published_by: OTHER }, 403],
    [undefined, {}, 403], ["editor", { is_ai_generated: true }, 422], ["admin", { answer_type: "ai_analysis" }, 422],
    ["admin", { created_at: new Date(Date.now() - 16 * 60 * 1000).toISOString() }, 422],
  ] as const) {
    const f = fixture({ role }); const answer = f.addAnswer({ created_at: new Date().toISOString(), ...overrides });
    const res = await f.load<Route>("app/api/answers/[id]/route.ts").PATCH(jsonRequest({ body: "An unauthorized edit attempt." }), context());
    assert.equal(res.status, expected); assert.equal(answer.body, "A draft response for review.");
    assert.equal(f.logs.filter(log => log.operation === "update").length, 0);
  }
});

test("answer edit atomically rejects approval during the request and validates malformed payloads", async () => {
  const f = fixture({ role: "responder" }); const answer = f.addAnswer({ created_at: new Date().toISOString() });
  f.beforeAnswerUpdate(() => { answer.is_draft = false; });
  const res = await f.load<Route>("app/api/answers/[id]/route.ts").PATCH(jsonRequest({ body: "A draft edit racing approval." }), context());
  assert.equal(res.status, 409); assert.equal(answer.body, "A draft response for review.");
  for (const [body, status] of [["{broken", 400], ["null", 422], ["[]", 422], ['{"body":123}', 422], ['{"body":"short"}', 422]] as const) {
    const g = fixture({ role: "admin" });
    const invalid = await g.load<Route>("app/api/answers/[id]/route.ts").PATCH(new Request("https://whytho.example.test/api/answers", { method: "PATCH", headers: { "Content-Type": "application/json" }, body }), context());
    assert.equal(invalid.status, status); assert.equal(g.logs.length, 0);
  }
});

test("unverified profile teams can edit drafts but cannot edit published official responses", async () => {
  for (const role of ["admin", "editor"]) {
    for (const draft of [true, false]) {
      const f = fixture({ role, tier: "1" }); const answer = f.addAnswer({ is_draft: draft, created_at: new Date().toISOString() });
      const res = await f.load<Route>("app/api/answers/[id]/route.ts").PATCH(jsonRequest({ body: "A prepared response for review." }), context());
      assert.equal(res.status, draft ? 200 : 403);
      assert.equal(answer.body, draft ? "A prepared response for review." : "A draft response for review.");
    }
  }
  const f = fixture({ role: "admin", tier: "1" }); const answer = f.addAnswer({ created_at: new Date().toISOString() });
  f.beforeAnswerUpdate(() => { answer.is_draft = false; });
  const res = await f.load<Route>("app/api/answers/[id]/route.ts").PATCH(jsonRequest({ body: "A draft edit racing publication." }), context());
  assert.equal(res.status, 409); assert.equal(answer.body, "A draft response for review.");
});

test("only verified publishing roles publish or approve official responses", async () => {
  for (const tier of ["0", "1", "2", "3"]) {
    for (const role of ["admin", "editor", "responder"]) {
      const f = fixture({ role, tier }); f.data.questions![0]!.submitted_by = null;
      const response = await f.load<Route>("app/api/answers/route.ts").POST(jsonRequest({ question_id: QUESTION, body: "A response prepared by the fixture team.", ...(role !== "responder" ? { answer_type: "direct" } : {}) }));
      assert.equal(response.status, 200);
      const payload = await response.json() as { is_draft: boolean };
      const canPublish = ["2", "3"].includes(tier) && role !== "responder";
      assert.equal(payload.is_draft, !canPublish, `${tier}/${role} publication`);
      assert.equal(f.data.answers![0]!.is_draft, !canPublish);

      const g = fixture({ role, tier }); const draft = g.addAnswer();
      const approval = await g.load<Route>("app/api/answers/[id]/approve/route.ts").POST(jsonRequest({}), context());
      assert.equal(approval.status, canPublish ? 200 : 403, `${tier}/${role} approval`);
      assert.equal(draft.is_draft, !canPublish);
    }
  }
});

test("verification lookup failures do not publish, approve, or edit answers", async () => {
  for (const operation of ["submit", "approve", "edit"]) {
    const f = fixture({ role: "admin" }); f.failedReads.add("politicians");
    const answer = operation === "submit" ? null : f.addAnswer({ created_at: new Date().toISOString() });
    const request = jsonRequest({ question_id: QUESTION, body: "A response requiring confirmed verification." });
    const response = operation === "submit" ? await f.load<Route>("app/api/answers/route.ts").POST(request)
      : operation === "approve" ? await f.load<Route>("app/api/answers/[id]/approve/route.ts").POST(request, context())
      : await f.load<Route>("app/api/answers/[id]/route.ts").PATCH(request, context());
    assert.equal(response.status, 503);
    assert.equal(f.logs.filter(log => log.operation !== "read").length, 0);
    if (answer) { assert.equal(answer.is_draft, true); assert.equal(answer.body, "A draft response for review."); }
    else assert.equal(f.data.answers!.length, 0);
  }
});
