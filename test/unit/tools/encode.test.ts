import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../../../src/tools/registry";

const run = (id: string, input: string, options: Record<string, unknown> = {}) =>
  runTool(id, { input }, options);

function out(r: ReturnType<typeof run>): string {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.output;
}

const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
const jwt = (payload: unknown) => `${b64url({ alg: "HS256", typ: "JWT" })}.${b64url(payload)}.sig`;

test("base64 encode/decode round-trips utf-8", () => {
  assert.equal(out(run("base64", "héllo")), "aMOpbGxv");
  assert.equal(out(run("base64", "aMOpbGxv", { mode: "decode" })), "héllo");
});

test("base64 urlSafe drops + / =", () => {
  const o = out(run("base64", "??>", { urlSafe: true }));
  assert.doesNotMatch(o, /[+/=]/);
  assert.equal(out(run("base64", o, { mode: "decode", urlSafe: true })), "??>");
});

test("base64 decode is strict", () => {
  const r = run("base64", "%%%", { mode: "decode" });
  assert.deepEqual(r, { ok: false, error: "Invalid Base64 input" });
  assert.equal(run("base64", "aM+/", { mode: "decode", urlSafe: true }).ok, false);
  assert.equal(run("base64", "a-_b", { mode: "decode" }).ok, false);
  assert.equal(out(run("base64", "aMOp\n bGxv", { mode: "decode" })), "héllo");
});

test("url component encode/decode", () => {
  assert.equal(out(run("url", "a b&c", { scope: "component" })), "a%20b%26c");
  assert.equal(out(run("url", "a%20b%26c", { mode: "decode" })), "a b&c");
  assert.equal(run("url", "%E0%A4%A", { mode: "decode" }).ok, false);
});

test("url uri scope keeps reserved chars", () => {
  assert.equal(out(run("url", "http://x.com/a b?q=1", { scope: "uri" })), "http://x.com/a%20b?q=1");
});

test("html encode/decode", () => {
  assert.equal(out(run("html", '<a href="x">')), "&lt;a href=&quot;x&quot;&gt;");
  assert.equal(out(run("html", "&#x1F600;&amp;", { mode: "decode" })), "😀&");
  assert.equal(out(run("html", "&lt;&#39;&apos;&nbsp;&#65;&bogus;", { mode: "decode" })), "<'' A&bogus;");
});

test("hex encode/decode", () => {
  assert.equal(out(run("hex", "hi")), "6869");
  assert.equal(out(run("hex", "6869", { mode: "decode" })), "hi");
  assert.equal(out(run("hex", "68 69 4A", { mode: "decode" })), "hiJ");
  assert.deepEqual(run("hex", "zz", { mode: "decode" }), { ok: false, error: "Invalid hex input" });
  assert.deepEqual(run("hex", "686", { mode: "decode" }), { ok: false, error: "Invalid hex input" });
});

test("jwt decodes and reports expiry", () => {
  // +30s margin: run() reads the clock later, floor-to-unit would otherwise flake at exactly 2h
  const exp = Math.floor(Date.now() / 1000) + 7200 + 30;
  const r = run("jwt", jwt({ sub: "1", exp }));
  assert.ok(r.ok);
  assert.match(r.output, /"exp"/);
  assert.match(r.output, /"alg": "HS256"/);
  assert.match(r.meta ?? "", /expires \d{4}-.*Z \(in 2h\)/);
  assert.match(r.meta ?? "", /Signature not verified\./);
});

test("jwt expired / no exp", () => {
  const exp = Math.floor(Date.now() / 1000) - 3 * 86400 - 30;
  const e = run("jwt", jwt({ exp }));
  assert.ok(e.ok);
  assert.match(e.meta ?? "", /expired 3d ago/);
  const r = run("jwt", jwt({ sub: "x" }));
  assert.ok(r.ok);
  assert.match(r.meta ?? "", /no exp claim · Signature not verified\./);
});

test("jwt malformed", () => {
  const r = run("jwt", "a.b");
  assert.ok(!r.ok);
  assert.match(r.error, /^Not a valid JWT: /);
  const r2 = run("jwt", "!!.@@.sig");
  assert.ok(!r2.ok);
  assert.match(r2.error, /^Not a valid JWT: /);
});
