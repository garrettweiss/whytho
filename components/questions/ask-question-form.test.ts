import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { runInNewContext } from "node:vm";
import React from "react";
import ts from "typescript";

// Exercise the actual form handlers offline. React hooks, browser time,
// authentication, Turnstile, and the submission endpoint are controlled here.
// No challenge is solved and no production question is submitted by these tests.
type Element = React.ReactElement<Record<string, unknown>>;
type Effect = { deps: unknown[]; cleanup?: () => void };
type FetchResult = { ok: boolean; json: () => Promise<{ error?: string }> };
const realRequire = createRequire(import.meta.url);
const sourcePath = resolve(process.cwd(), "components/questions/ask-question-form.tsx");
const compiled = ts.transpileModule(readFileSync(sourcePath, "utf8"), {
  fileName: sourcePath,
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true },
}).outputText;

function fixture(options: { siteKey?: string; signedIn?: boolean; appearance?: "default" | "face" } = {}) {
  const states: unknown[] = [];
  const effects: Effect[] = [];
  const timers = new Map<number, () => void>();
  const requests: { url: string; body: string }[] = [];
  const auth = { user: options.signedIn === false ? null : { id: "fixture-user", is_anonymous: false }, isLoading: false };
  const Turnstile = () => null;
  let stateCursor = 0;
  let effectCursor = 0;
  let nextTimer = 1;
  let pending = false;
  let transition: Promise<void> | undefined;
  let queuedEffects: (() => void)[] = [];
  let removedScripts = 0;
  let refreshed = 0;
  let response: () => Promise<FetchResult> = async () => ({ ok: false, json: async () => ({ error: "Try again later." }) });
  const browser: { turnstile?: object; setTimeout: (callback: () => void, delay: number) => number; clearTimeout: (id: number) => void } = {
    setTimeout: (callback, delay) => { assert.equal(delay, 15_000); const id = nextTimer++; timers.set(id, callback); return id; },
    clearTimeout: (id) => { timers.delete(id); },
  };

  function useState(initial: unknown) {
    const slot = stateCursor++;
    if (!(slot in states)) states[slot] = initial;
    return [states[slot], (next: unknown) => { states[slot] = typeof next === "function" ? (next as (value: unknown) => unknown)(states[slot]) : next; }];
  }
  const react = {
    useState,
    useRef: (initial: unknown) => useState({ current: initial })[0],
    useId: () => "fixture",
    useTransition: () => [pending, (callback: () => Promise<void>) => {
      pending = true;
      transition = callback().finally(() => { pending = false; });
    }],
    useEffect: (callback: () => (() => void) | undefined, deps: unknown[]) => {
      const slot = effectCursor++;
      const previous = effects[slot];
      if (previous && deps.length === previous.deps.length && deps.every((dep, index) => Object.is(dep, previous.deps[index]))) return;
      queuedEffects.push(() => { previous?.cleanup?.(); effects[slot] = { deps, cleanup: callback() }; });
    },
  };
  const stubs: Record<string, unknown> = {
    react,
    "@marsidev/react-turnstile": { Turnstile, DEFAULT_SCRIPT_ID: "cf-turnstile-script" },
    "@/lib/auth/use-user": { useUser: () => auth },
    "next/navigation": { usePathname: () => "/fixture-person", useRouter: () => ({ refresh: () => { refreshed++; } }) },
    "next/link": { __esModule: true, default: "a" },
    "./face-questions.module.css": { __esModule: true, default: {} },
  };
  const loadedModule = { exports: {} as { AskQuestionForm: (props: object) => Element } };
  runInNewContext(`(function(require, module, exports) { ${compiled}\n })`, {
    process: { env: { NEXT_PUBLIC_CLOUDFLARE_TURNSTILE_SITE_KEY: options.siteKey ?? "fixture-site-key" } },
    window: browser,
    document: { getElementById: (id: string) => { assert.equal(id, "cf-turnstile-script"); return { remove: () => { removedScripts++; } }; } },
    fetch: async (url: string, init: { body: string }) => { requests.push({ url, body: init.body }); return response(); },
  })((name: string) => name in stubs ? stubs[name] : realRequire(name), loadedModule, loadedModule.exports);

  function render() {
    stateCursor = 0;
    effectCursor = 0;
    queuedEffects = [];
    const tree = loadedModule.exports.AskQuestionForm({ politicianId: "fixture-politician", politicianName: "Fixture Person", appearance: options.appearance });
    queuedEffects.forEach((effect) => effect());
    return tree;
  }
  function elements(node: unknown): Element[] {
    if (Array.isArray(node)) return node.flatMap(elements);
    if (!React.isValidElement<Record<string, unknown>>(node)) return [];
    return [node, ...elements(node.props.children)];
  }
  function find(predicate: (node: Element) => boolean) {
    const element = elements(render()).find(predicate);
    assert.ok(element, "Expected form element to exist");
    return element;
  }
  const invoke = (element: Element, callback: string, ...args: unknown[]) => {
    assert.equal(typeof element.props[callback], "function");
    return (element.props[callback] as (...values: unknown[]) => unknown)(...args);
  };
  const widget = () => find((node) => node.type === Turnstile);
  const textarea = () => find((node) => node.type === "textarea");
  const submit = () => find((node) => node.type === "button" && node.props.type === "submit");
  render();
  return {
    render, find, invoke, widget, textarea, submit, requests,
    status: () => find((node) => node.props.id === "fixture-verification-status").props.children,
    write: (text: string) => invoke(textarea(), "onChange", { target: { value: text } }),
    event: (name: string, ...args: unknown[]) => invoke(widget(), name, ...args),
    retry: () => invoke(find((node) => node.type === "button" && node.props.children === "Retry verification"), "onClick"),
    beginSubmit: () => invoke(find((node) => node.type === "form"), "onSubmit", { preventDefault() {} }),
    finishSubmit: async () => { await transition; render(); },
    elapse: () => { const callbacks = [...timers.values()]; timers.clear(); callbacks.forEach((callback) => callback()); render(); },
    scriptLoaded: () => { browser.turnstile = {}; },
    scriptErrors: () => (widget().props.scriptOptions as { onError: () => void }).onError(),
    setResponse: (next: typeof response) => { response = next; },
    timers: () => timers.size,
    removedScripts: () => removedScripts,
    refreshed: () => refreshed,
  };
}

test("verification is visible in both form layouts and gates valid questions until success", () => {
  for (const appearance of ["default", "face"] as const) {
    const f = fixture({ appearance });
    f.write("What will you do about this issue?");
    assert.deepEqual(JSON.parse(JSON.stringify(f.widget().props.options)), {
      size: "compact", appearance: "always", theme: appearance === "face" ? "dark" : "auto", retry: "never", refreshExpired: "manual", refreshTimeout: "manual",
    });
    assert.equal(f.submit().props.disabled, true);
    f.beginSubmit();
    assert.equal(f.requests.length, 0);
    f.event("onSuccess", "fresh-token");
    assert.equal(f.submit().props.disabled, false);
    assert.equal(f.status(), "Verification complete.");
  }
});

test("blocked script times out visibly and retry preserves the question while reloading verification", () => {
  const f = fixture();
  f.write("Please explain your position on this issue.");
  const previousKey = f.widget().key;
  assert.equal(f.timers(), 1);
  f.elapse();
  assert.match(String(f.status()), /could not load or finish/);
  assert.equal(f.submit().props.disabled, true);
  f.retry();
  assert.equal(f.removedScripts(), 1);
  assert.notEqual(f.widget().key, previousKey);
  assert.equal(f.textarea().props.value, "Please explain your position on this issue.");
  assert.equal(f.status(), "Loading verification…");
  assert.equal(f.timers(), 1);
});

test("loading watchdog never interrupts an interactive challenge or completed verification", () => {
  for (const callback of ["onWidgetLoad", "onBeforeInteractive", "onSuccess"]) {
    const f = fixture();
    f.event(callback, "fixture-value");
    const status = f.status();
    assert.equal(f.timers(), 0);
    f.elapse();
    assert.equal(f.status(), status);
  }
});

test("expiry, timeout, widget and script failures revoke tokens and allow a fresh challenge", () => {
  for (const callback of ["onExpire", "onTimeout", "onError", "scriptError"]) {
    const f = fixture();
    f.scriptLoaded();
    f.write("What will you do about this issue?");
    f.event("onSuccess", "old-token");
    assert.equal(f.submit().props.disabled, false);
    if (callback === "scriptError") f.scriptErrors();
    else f.event(callback, "fixture-error");
    assert.equal(f.submit().props.disabled, true);
    f.beginSubmit();
    assert.equal(f.requests.length, 0);
    f.retry();
    assert.equal(f.removedScripts(), 0);
    f.event("onSuccess", "new-token");
    assert.equal(f.submit().props.disabled, false);
  }
});

test("missing configuration and unsupported browsers fail closed with honest guidance", () => {
  const missing = fixture({ siteKey: "" });
  missing.write("What will you do about this issue?");
  assert.match(String(missing.status()), /temporarily unavailable/);
  assert.equal(missing.submit().props.disabled, true);
  assert.equal(missing.timers(), 0);
  assert.throws(() => missing.widget(), /Expected form element/);
  const unsupported = fixture();
  unsupported.event("onUnsupported");
  assert.match(String(unsupported.status()), /updated browser/);
  assert.equal(unsupported.submit().props.disabled, true);
});

test("server and transport failures preserve the question and cannot reuse the consumed token", async () => {
  for (const networkFailure of [false, true]) {
    const f = fixture();
    f.scriptLoaded();
    if (networkFailure) f.setResponse(async () => { throw new Error("Connection interrupted"); });
    f.write("  What will you do about this issue?  ");
    f.event("onSuccess", "single-use-token");
    const previousKey = f.widget().key;
    f.beginSubmit();
    assert.equal(f.submit().props.disabled, true);
    await f.finishSubmit();
    assert.equal(f.requests.length, 1);
    assert.deepEqual(JSON.parse(f.requests[0]!.body), { politician_id: "fixture-politician", body: "What will you do about this issue?", turnstile_token: "single-use-token" });
    assert.equal(f.textarea().props.value, "  What will you do about this issue?  ");
    assert.notEqual(f.widget().key, previousKey);
    f.beginSubmit();
    assert.equal(f.requests.length, 1);
    f.event("onSuccess", "replacement-token");
    f.beginSubmit();
    await f.finishSubmit();
    assert.equal(JSON.parse(f.requests[1]!.body).turnstile_token, "replacement-token");
  }
});

test("a successful question starts another form with a fresh verification", async () => {
  const f = fixture();
  f.scriptLoaded();
  f.setResponse(async () => ({ ok: true, json: async () => ({}) }));
  f.write("What will you do about this issue?");
  f.event("onSuccess", "single-use-token");
  f.beginSubmit();
  await f.finishSubmit();
  assert.equal(f.render().props["aria-label"], "Question submitted");
  assert.equal(f.refreshed(), 1);
  f.invoke(f.find((node) => node.type === "button"), "onClick");
  assert.equal(f.textarea().props.value, "");
  assert.equal(f.submit().props.disabled, true);
  assert.equal(f.status(), "Loading verification…");
  assert.equal(f.timers(), 1);
});

test("signed-out visitors receive the sign-in path without starting verification", () => {
  const f = fixture({ signedIn: false });
  assert.equal(f.render().type, "section");
  assert.equal(f.timers(), 0);
  assert.match(String(f.find((node) => node.type === "a").props.href), /sign-in\?redirect=/);
});
