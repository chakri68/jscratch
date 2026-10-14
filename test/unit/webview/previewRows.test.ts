import { test } from "node:test";
import assert from "node:assert/strict";
import {
  cellText,
  filterIndexes,
  footerText,
  haystacks,
  nextSort,
  sortIndexes,
  truncate,
} from "../../../src/webview/preview/rows";

const all = (n: number) => Array.from({ length: n }, (_, i) => i);

test("nextSort cycles asc → desc → none, and a new column starts at asc", () => {
  const asc = nextSort(undefined, 2);
  assert.deepEqual(asc, { column: 2, dir: "asc" });
  const desc = nextSort(asc, 2);
  assert.deepEqual(desc, { column: 2, dir: "desc" });
  assert.equal(nextSort(desc, 2), undefined);
  assert.deepEqual(nextSort(desc, 0), { column: 0, dir: "asc" });
});

test("numbers sort numerically with nulls last both ways", () => {
  const rows = [[10], [null], [2], [undefined], [33]];
  const col = (order: number[]) => order.map((i) => rows[i][0]);
  assert.deepEqual(col(sortIndexes(rows, all(5), { column: 0, dir: "asc" })), [2, 10, 33, null, undefined]);
  assert.deepEqual(col(sortIndexes(rows, all(5), { column: 0, dir: "desc" })), [33, 10, 2, null, undefined]);
});

test("strings sort with numeric collation; no sort keeps file order", () => {
  const rows = [["item10"], ["item2"], [null], ["item1"]];
  const col = (order: number[]) => order.map((i) => rows[i][0]);
  assert.deepEqual(col(sortIndexes(rows, all(4), { column: 0, dir: "asc" })), ["item1", "item2", "item10", null]);
  assert.deepEqual(sortIndexes(rows, all(4), undefined), [0, 1, 2, 3]);
});

test("sorting only reorders the given (filtered) indexes", () => {
  const rows = [[3], [1], [2]];
  assert.deepEqual(sortIndexes(rows, [0, 2], { column: 0, dir: "asc" }), [2, 0]);
});

test("filter is a case-insensitive substring over the stringified row", () => {
  const hay = haystacks([["Alice", 30, { city: "Pune" }], ["bob", null, true]]);
  assert.deepEqual(filterIndexes(hay, "ALI"), [0]);
  assert.deepEqual(filterIndexes(hay, "pune"), [0]);
  assert.deepEqual(filterIndexes(hay, "true"), [1]);
  assert.deepEqual(filterIndexes(hay, ""), [0, 1]);
  assert.deepEqual(filterIndexes(hay, "zzz"), []);
});

test("cellText and truncate", () => {
  assert.equal(cellText(null), "");
  assert.equal(cellText(false), "false");
  assert.equal(cellText({ a: [1, 2] }), '{"a":[1,2]}');
  assert.equal(truncate("x".repeat(120)), "x".repeat(120));
  const long = truncate("x".repeat(200));
  assert.equal(long.length, 120);
  assert.ok(long.endsWith("…"));
});

test("footer text, with and without a filter", () => {
  assert.equal(footerText(1000, 50000, 7), `showing ${(1000).toLocaleString()} of ${(50000).toLocaleString()} rows · 7 columns`);
  assert.equal(
    footerText(1000, 50000, 7, 12),
    `12 matching · showing ${(1000).toLocaleString()} of ${(50000).toLocaleString()} rows · 7 columns`,
  );
});
