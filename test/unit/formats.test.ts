import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  formatFromFilename,
  guessFormat,
  parse,
  serialize,
  tabulate,
} from "../../src/etl/formats";

test("formatFromFilename maps extensions", () => {
  assert.equal(formatFromFilename("a.JSONL"), "ndjson");
  assert.equal(formatFromFilename("a.csv"), "csv");
  assert.equal(formatFromFilename("a.bin"), undefined);
  assert.equal(formatFromFilename("noext"), undefined);
});

test("parse csv handles quoted commas and escaped quotes", () => {
  const { data } = parse("x.csv", 'name,note\n"Smith, J","a ""q"""\n');
  assert.deepEqual(data, [{ name: "Smith, J", note: 'a "q"' }]);
});

test("parse csv with CRLF and dynamic typing", () => {
  assert.deepEqual(parse("x.csv", "n\r\n1\r\n2\r\n").data, [{ n: 1 }, { n: 2 }]);
});

test("parse txt and ndjson strip \\r and blank lines", () => {
  assert.deepEqual(parse("x.txt", "a\r\nb").data, ["a", "b"]);
  assert.deepEqual(parse("x.ndjson", '{"a":1}\r\n\r\n{"a":2}').data, [
    { a: 1 },
    { a: 2 },
  ]);
});

test("parse bad json falls back to raw with warning", () => {
  const r = parse("x.json", "{nope");
  assert.equal(r.data, "{nope");
  assert.match(r.warning ?? "", /JSON/);
});

test("parse unknown extension returns raw, no warning", () => {
  const r = parse("x.bin", "zz");
  assert.deepEqual(r, { data: "zz" });
});

test("serialize csv", () => {
  assert.equal(serialize("csv", [{ a: 1, b: "x,y" }]), 'a,b\r\n1,"x,y"');
  assert.throws(() => serialize("csv", 5), /CSV needs an array of objects or arrays/);
});

test("serialize ndjson", () => {
  assert.equal(serialize("ndjson", [{ a: 1 }, { a: 2 }]), '{"a":1}\n{"a":2}');
  assert.throws(() => serialize("ndjson", {}), /NDJSON needs an array/);
});

test("serialize txt and json", () => {
  assert.equal(serialize("txt", ["a", "b"]), "a\nb");
  assert.equal(serialize("txt", { a: 1 }), JSON.stringify({ a: 1 }, null, 2));
  const x = { a: [1, 2] };
  assert.equal(serialize("json", x), JSON.stringify(x, null, 2));
});

test("tabulate", () => {
  assert.deepEqual(tabulate([{ a: 1 }, { b: 2 }]), {
    columns: ["a", "b"],
    rows: [
      [1, undefined],
      [undefined, 2],
    ],
  });
  assert.deepEqual(tabulate([[1, 2], [3]]), {
    columns: ["1", "2"],
    rows: [[1, 2], [3]],
  });
  assert.equal(tabulate({}), undefined);
});

test("guessFormat", () => {
  assert.equal(guessFormat('{"a":1}'), "json");
  assert.equal(guessFormat("a,b\n1,2"), "csv");
  assert.equal(guessFormat("hello"), "txt");
});

test("parse csv with unclosed quote falls back to raw with warning", () => {
  const raw = 'a,b\n1,"oops\n';
  const r = parse("x.csv", raw);
  assert.equal(r.data, raw);
  assert.match(r.warning ?? "", /CSV/);
});

test("parse csv with short row keeps data and warns", () => {
  const r = parse("x.csv", "a,b\n1,2\n3\n");
  assert.deepEqual(r.data, [{ a: 1, b: 2 }, { a: 3 }]);
  assert.match(r.warning ?? "", /CSV row 2/);
});

test("parse ndjson warning has line number", () => {
  const r = parse("x.ndjson", '{"a":1}\n\n{bad');
  assert.match(r.warning ?? "", /Invalid NDJSON at line 3/);
});

test("serialize json of undefined is null", () => {
  assert.equal(serialize("json", undefined), "null");
});

test("tabulate handles 200k array rows", () => {
  const rows = Array.from({ length: 200000 }, (_, i) => [i, i]);
  assert.equal(tabulate(rows)?.rows.length, 200000);
});

test("serialize csv JSON-encodes nested cells, empties null/undefined", () => {
  assert.equal(
    serialize("csv", [{ a: { b: 1 }, c: [1, 2], d: null, e: undefined }]),
    'a,c,d,e\r\n"{""b"":1}","[1,2]",,',
  );
  assert.equal(serialize("csv", [[{ x: 1 }, null]]), '"{""x"":1}",');
});

test("serialize csv rejects mixed rows, naming the row", () => {
  assert.throws(
    () => serialize("csv", [[1, 2], { a: 1 }]),
    /^Error: CSV needs an array of objects or arrays \(row 2 is object\)$/,
  );
  assert.throws(
    () => serialize("csv", [{ a: 1 }, 5]),
    /CSV needs an array of objects or arrays \(row 2 is number\)/,
  );
});

test("serialize csv keeps keys missing from row 1", () => {
  assert.equal(serialize("csv", [{ a: 1 }, { b: 2 }]), "a,b\r\n1,\r\n,2");
});
