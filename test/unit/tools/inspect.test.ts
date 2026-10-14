import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../../../src/tools/registry";
import { nextRuns } from "../../../src/tools/inspect/cron";

function ok(id: string, fields: Record<string, string>) {
  const r = runTool(id, fields);
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r;
}

test("regex: matches, ranges, groups", () => {
  const r = ok("regex", { pattern: "(\\d+)", flags: "", text: "a1b22" });
  assert.ok(r.ok);
  assert.deepEqual((r.data as { ranges: number[][] }).ranges, [[1, 2], [3, 5]]);
  assert.equal(r.output, '#1 [1-2] "1"\n  $1 = "1"\n#2 [3-5] "22"\n  $1 = "22"');
  assert.equal(r.meta, "2 matches");
});

test("regex: named groups", () => {
  const r = ok("regex", { pattern: "(?<n>\\d)", flags: "", text: "x7" });
  assert.ok(r.ok);
  assert.equal(r.output, '#1 [1-2] "7"\n  n = "7"');
});

test("regex: mixed named and numbered groups", () => {
  const r = ok("regex", { pattern: "(a)(?<n>b)(?:c)(d)", flags: "", text: "abcd" });
  assert.ok(r.ok);
  assert.equal(r.output, '#1 [0-4] "abcd"\n  $1 = "a"\n  n = "b"\n  $3 = "d"');
});

test("regex: invalid pattern and flags", () => {
  assert.equal(runTool("regex", { pattern: "(", flags: "", text: "x" }).ok, false);
  assert.equal(runTool("regex", { pattern: "a", flags: "z", text: "x" }).ok, false);
});

test("regex: empty matches terminate", () => {
  const r = ok("regex", { pattern: "a*", flags: "", text: "bbb" });
  assert.ok(r.ok);
  assert.equal((r.data as { ranges: number[][] }).ranges.length, 4);
});

test("regex: duplicate flags tolerated, u advances by code point", () => {
  const r = ok("regex", { pattern: "", flags: "ggu", text: "😀" });
  assert.ok(r.ok);
  assert.equal((r.data as { ranges: number[][] }).ranges.length, 2);
});

test("regex: caps at 1000 matches", () => {
  const r = ok("regex", { pattern: "a", flags: "", text: "a".repeat(1500) });
  assert.ok(r.ok);
  assert.equal(r.meta, "1000+ matches (capped)");
  assert.equal((r.data as { ranges: number[][] }).ranges.length, 1000);
});

test("jsonpath: collects results", () => {
  const r = ok("jsonpath", { json: '{"a":{"id":1},"b":[{"id":2}]}', path: "$..id" });
  assert.ok(r.ok);
  assert.deepEqual(JSON.parse(r.output), [1, 2]);
  assert.equal(r.meta, "2 results");
});

test("jsonpath: invalid json / path", () => {
  const a = runTool("jsonpath", { json: "{", path: "$" });
  assert.ok(!a.ok && /^Invalid JSON/.test(a.error));
  assert.equal(runTool("jsonpath", { json: '{"a":1}', path: "$[?(@.a ==)]" }).ok, false);
});

test("diff: counts", () => {
  const r = ok("diff", { left: "a\nb\nc", right: "a\nc\nd" });
  assert.ok(r.ok);
  assert.equal(r.meta, "+1 −1 lines");
  assert.equal(r.output, "");
});

test("diff: identical and cap", () => {
  const r = ok("diff", { left: "a\nb", right: "a\nb" });
  assert.ok(r.ok);
  assert.equal(r.meta, "No differences");
  const big = Array(5001).fill("x").join("\n");
  const e = runTool("diff", { left: big, right: "x" });
  assert.ok(!e.ok && /Too many lines/.test(e.error));
});

test("cron: nextRuns step", () => {
  const runs = nextRuns("*/15 * * * *", new Date(2026, 0, 1, 0, 7), 3);
  assert.deepEqual(runs, [new Date(2026, 0, 1, 0, 15), new Date(2026, 0, 1, 0, 30), new Date(2026, 0, 1, 0, 45)]);
});

test("cron: dom/dow OR semantics, 7=Sunday, yearly", () => {
  // 2026-01-01 is Thursday. dom 15 OR Sunday(7)
  const runs = nextRuns("0 0 15 * 7", new Date(2026, 0, 1, 0, 0), 2);
  assert.deepEqual(runs, [new Date(2026, 0, 4), new Date(2026, 0, 11)]);
  const y = nextRuns("0 0 1 1 *", new Date(2026, 0, 1, 0, 0), 2);
  assert.deepEqual(y, [new Date(2027, 0, 1), new Date(2028, 0, 1)]);
});

test("cron: ranges with step, invalid", () => {
  const r = nextRuns("10-20/5 3 * * *", new Date(2026, 0, 1, 0, 0), 3);
  assert.deepEqual(r.map((d) => d.getMinutes()), [10, 15, 20]);
  assert.throws(() => nextRuns("61 * * * *", new Date(), 1));
});

test("cron tool: description and runs", () => {
  const r = ok("cron", { expression: "0 9 * * 1-5" });
  assert.ok(r.ok);
  assert.match(r.output, /Monday through Friday/);
  assert.match(r.output, /\n\nNext runs:\n/);
  assert.equal(r.output.split("Next runs:\n")[1].split("\n").length, 5);
});

test("cron tool: rejects 6 fields and macros", () => {
  for (const e of ["0 * * * * *", "@yearly"]) {
    const r = runTool("cron", { expression: e });
    assert.ok(!r.ok && /Only 5-field cron is supported/.test(r.error));
  }
});
