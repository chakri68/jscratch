import { test } from "node:test";
import { strict as assert } from "node:assert";
import { inferType, typeDefForFile } from "../../src/etl/typeInference";

test("inferType maps object keys, quoting non-identifiers", () => {
  const out = inferType({ a: 1, "b-c": [true] });
  assert.match(out, /a: number;/);
  assert.match(out, /"b-c": boolean\[\];/);
});

test("inferType handles empty array and null", () => {
  assert.equal(inferType([]), "any[]");
  assert.equal(inferType(null), "any");
});

test("typeDefForFile falls back to any on invalid json", () => {
  assert.equal(typeDefForFile("x.json", "not json"), "any");
});

test("typeDefForFile by extension", () => {
  assert.equal(typeDefForFile("x.txt", "a\nb"), "string[]");
  assert.equal(typeDefForFile("x.csv", "a,b"), "string[][]");
  assert.equal(typeDefForFile("x.bin", "zz"), "any");
});
