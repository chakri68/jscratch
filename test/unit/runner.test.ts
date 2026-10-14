import { test } from "node:test";
import assert from "node:assert";
import * as fs from "fs";
import * as os from "os";
import { runTransform, RunRequest } from "../../src/etl/runner";

const tmpCount = () =>
  fs.readdirSync(os.tmpdir()).filter((n) => n.startsWith("jscratch-")).length;

function run(body: string, over: Partial<RunRequest> = {}) {
  return runTransform({
    scriptSource: `export ${body}`,
    inputFilename: "in.json",
    inputRaw: "[1,2,3]",
    timeoutMs: 10000,
    ...over,
  });
}

const before = tmpCount();

test("returns value and keeps logs separate", async () => {
  const logs: string[] = [];
  const r = await run(
    `function transform() { console.log("noise"); return input.data.length; }`,
    { onLog: (l) => logs.push(l) },
  );
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.value, 3);
  assert.deepStrictEqual(logs, ["noise"]);
});

test("async transform", async () => {
  const r = await run(
    `async function transform() { await new Promise(r => setTimeout(r, 10)); return "x"; }`,
  );
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.value, "x");
});

test("thrown error", async () => {
  const r = await run(`function transform() { throw new Error("boom"); }`);
  assert.ok(!r.ok);
  assert.match(r.error!, /boom/);
});

test("timeout", async () => {
  const r = await run(`function transform() { while(true){} }`, {
    timeoutMs: 500,
  });
  assert.ok(!r.ok);
  assert.match(r.error!, /timed out after 500ms/);
});

test("undefined result", async () => {
  const r = await run(`function transform() { }`);
  assert.strictEqual(
    r.error,
    "transform() returned undefined — did you forget to return?",
  );
});

test("circular and BigInt", async () => {
  const c = await run(`function transform() { const a: any = {}; a.a = a; return a; }`);
  assert.match(c.error!, /circular/i);
  const b = await run(`function transform() { return 10n; }`);
  assert.match(b.error!, /BigInt/);
});

test("syntax error names userTransform.ts", async () => {
  const r = await run(`function transform( {`);
  assert.ok(!r.ok);
  assert.match(r.error!, /userTransform\.ts/);
});

test("csv is parsed host-side", async () => {
  const r = await run(`function transform() { return input.data[0].name; }`, {
    inputFilename: "in.csv",
    inputRaw: 'name,age\n"Smith, J",3\n',
  });
  assert.ok(r.ok, r.error);
  assert.strictEqual(r.value, "Smith, J");
});

test("abort", async () => {
  const ac = new AbortController();
  const p = run(`function transform() { while(true){} }`, { signal: ac.signal });
  setTimeout(() => ac.abort(), 300);
  const r = await p;
  assert.strictEqual(r.error, "Cancelled");
});

test("flushes partial last line", async () => {
  const logs: string[] = [];
  await run(
    `function transform() { process.stdout.write("a\\nb"); return 1; }`,
    { onLog: (l) => logs.push(l) },
  );
  assert.deepStrictEqual(logs, ["a", "b"]);
});

test("no temp dir leak", () => {
  assert.ok(tmpCount() <= before);
});
