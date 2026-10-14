import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  nextTransformName,
  outputFilenameFor,
  validateFileName,
} from "../../src/etl/names";

test("validateFileName accepts a fresh name", () => {
  assert.equal(validateFileName("data.json", ["other.json"]), undefined);
});

test("validateFileName rejects empty and whitespace", () => {
  assert.equal(validateFileName("", []), "Name can't be empty");
  assert.equal(validateFileName("   ", []), "Name can't be empty");
});

test("validateFileName rejects slashes", () => {
  assert.match(validateFileName("a/b.json", []) ?? "", /slash/);
  assert.match(validateFileName("a\\b.json", []) ?? "", /slash/);
});

test("validateFileName rejects pipeline.json", () => {
  assert.equal(
    validateFileName("pipeline.json", []),
    "pipeline.json is reserved",
  );
});

test("validateFileName rejects duplicates, case-sensitively", () => {
  assert.match(
    validateFileName("data.json", ["data.json"]) ?? "",
    /already exists/,
  );
  assert.equal(validateFileName("Data.json", ["data.json"]), undefined);
});

test("nextTransformName starts at 1", () => {
  assert.equal(nextTransformName([]), "transform-1.ts");
  assert.equal(nextTransformName(["data.json"]), "transform-1.ts");
});

test("nextTransformName uses highest N + 1", () => {
  assert.equal(
    nextTransformName(["transform-1.ts", "transform-7.ts"]),
    "transform-8.ts",
  );
});

test("outputFilenameFor swaps .ts for .out.<format>", () => {
  assert.equal(
    outputFilenameFor("transform-1.ts", "json"),
    "transform-1.out.json",
  );
  assert.equal(
    outputFilenameFor("transform-2.ts", "csv"),
    "transform-2.out.csv",
  );
});
