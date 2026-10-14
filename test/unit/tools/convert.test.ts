import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../../../src/tools/registry";

const run = (
  id: string,
  input: string,
  options: Record<string, unknown> = {},
) => runTool(id, { input }, options);

function out(r: ReturnType<typeof run>): string {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.output;
}

test("json-format minify and pretty", () => {
  assert.equal(
    out(run("json-format", '{ "a": 1 }', { style: "minify" })),
    '{"a":1}',
  );
  assert.equal(
    out(run("json-format", '{"a":1}', { indent: 4 })),
    '{\n    "a": 1\n}',
  );
});

test("json-format sortKeys is recursive", () => {
  const o = out(
    run("json-format", '{"b":{"z":1,"y":2},"a":[{"d":1,"c":2}]}', {
      sortKeys: true,
      style: "minify",
    }),
  );
  assert.equal(o, '{"a":[{"c":2,"d":1}],"b":{"y":2,"z":1}}');
});

test("invalid JSON reports the parse message", () => {
  let msg = "";
  try {
    JSON.parse("{nope");
  } catch (e) {
    msg = (e as Error).message;
  }
  for (const id of [
    "json-format",
    "json-yaml",
    "json-csv",
    "json-toml",
    "json-ts",
  ]) {
    const r = run(id, "{nope");
    assert.ok(!r.ok);
    assert.equal(r.error, `Invalid JSON: ${msg}`);
  }
});

test("json-yaml round-trips", () => {
  const y = out(run("json-yaml", '{"a":1,"b":[1,2]}'));
  assert.match(y, /^a: 1/);
  assert.deepEqual(
    JSON.parse(out(run("json-yaml", y, { direction: "from" }))),
    { a: 1, b: [1, 2] },
  );
});

test("json-toml round-trips; top-level array rejected", () => {
  const t = out(run("json-toml", '{"a":1,"b":[1,2]}'));
  assert.deepEqual(
    JSON.parse(out(run("json-toml", t, { direction: "from" }))),
    { a: 1, b: [1, 2] },
  );
  const r = run("json-toml", "[1,2]");
  assert.ok(!r.ok);
  assert.match(r.error, /TOML needs an object/);
});

test("json-csv round-trips", () => {
  const c = out(run("json-csv", '[{"a":1,"b":"x"}]'));
  assert.equal(c, "a,b\r\n1,x");
  assert.deepEqual(JSON.parse(out(run("json-csv", c, { direction: "from" }))), [
    { a: 1, b: "x" },
  ]);
  assert.ok(!run("json-csv", '{"a":1}').ok);
});

test("json-ts", () => {
  const o = out(run("json-ts", '{"id":1}'));
  assert.ok(o.startsWith("interface Root {"));
  assert.match(o, /id: number;/);
  assert.equal(out(run("json-ts", "[1]")), "type Root = number[];");
});

test("meta names the direction", () => {
  const r = runTool("json-yaml", { input: '{"a":1}' });
  assert.ok(r.ok);
  assert.equal(r.meta, "JSON → YAML");
});

test("json-csv JSON-encodes nested values", () => {
  assert.equal(
    out(run("json-csv", '[{"a":{"b":1},"c":[1,2]}]')),
    'a,c\r\n"{""b"":1}","[1,2]"',
  );
});

test("json-ts: primitive root is a type alias", () => {
  assert.equal(out(run("json-ts", "42")), "type Root = number;");
  assert.equal(out(run("json-ts", "null")), "type Root = any;");
});

test("json-ts: non-identifier keys are JSON-quoted", () => {
  assert.match(out(run("json-ts", '{"a\\"b":1}')), /"a\\"b": number;/);
});
