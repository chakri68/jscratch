import { test } from "node:test";
import assert from "node:assert/strict";
import { columnSchema, describeValue } from "../../src/preview/schema";

test("columnSchema: nulls don't affect type; numbers and strings mix", () => {
  assert.deepEqual(columnSchema(["a", "b"], [[1, "x"], [null, 2]]), [
    { name: "a", type: "number", nulls: 1 },
    { name: "b", type: "mixed", nulls: 0 },
  ]);
});

test("columnSchema: all-null column is null; undefined and short rows count as nulls", () => {
  assert.deepEqual(columnSchema(["a", "b"], [[null], [undefined, undefined]]), [
    { name: "a", type: "null", nulls: 2 },
    { name: "b", type: "null", nulls: 2 },
  ]);
});

test("columnSchema: string and boolean columns", () => {
  assert.deepEqual(columnSchema(["s", "b"], [["x", true], ["y", false]]), [
    { name: "s", type: "string", nulls: 0 },
    { name: "b", type: "boolean", nulls: 0 },
  ]);
});

test("columnSchema: NaN mixes with finite numbers, but an all-NaN column is number", () => {
  assert.deepEqual(columnSchema(["a", "b"], [[1, NaN], [NaN, Infinity]]), [
    { name: "a", type: "mixed", nulls: 0 },
    { name: "b", type: "number", nulls: 0 },
  ]);
});

test("columnSchema: objects and arrays make a column mixed", () => {
  assert.deepEqual(columnSchema(["o"], [[{ x: 1 }], [{ y: 2 }]]), [
    { name: "o", type: "mixed", nulls: 0 },
  ]);
});

test("columnSchema: no rows means every column is null with 0 nulls", () => {
  assert.deepEqual(columnSchema(["a"], []), [{ name: "a", type: "null", nulls: 0 }]);
});

test("describeValue: objects list their first keys", () => {
  const obj = Object.fromEntries(Array.from({ length: 12 }, (_, i) => [String.fromCharCode(97 + i), i]));
  assert.equal(describeValue(obj), "object with 12 keys: a, b, c…");
  assert.equal(describeValue({ a: 1, b: 2 }), "object with 2 keys: a, b");
  assert.equal(describeValue({ a: 1 }), "object with 1 key: a");
  assert.equal(describeValue({}), "empty object");
});

test("describeValue: strings report their UTF-8 size", () => {
  assert.equal(describeValue("x".repeat(3277)), "string (3.2 KB)");
  assert.equal(describeValue("hey"), "string (3 B)");
  assert.equal(describeValue("é"), "string (2 B)");
  assert.equal(describeValue("x".repeat(3 * 1024 * 1024)), "string (3.0 MB)");
});

test("describeValue: arrays, scalars, null", () => {
  assert.equal(describeValue([1, 2, 3]), "array of 3 items");
  assert.equal(describeValue(["a"]), "array of 1 item");
  assert.equal(describeValue([]), "empty array");
  assert.equal(describeValue(42), "number: 42");
  assert.equal(describeValue(true), "boolean: true");
  assert.equal(describeValue(null), "null");
});
