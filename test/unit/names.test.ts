import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  nextTransformName,
  outputFilenameFor,
  sessionIdFromUri,
  uniqueName,
  safeInputName,
  classifyDropUris,
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

test("sessionIdFromUri extracts the first path segment", () => {
  assert.equal(sessionIdFromUri({ path: "/s1/a.ts" }), "s1");
  assert.equal(sessionIdFromUri({ path: "/s1" }), "s1");
  assert.equal(sessionIdFromUri({ path: "/" }), undefined);
  assert.equal(sessionIdFromUri({ path: "" }), undefined);
  assert.equal(sessionIdFromUri({ path: "/s1/sub/a.ts" }), "s1");
});

test("uniqueName leaves free names alone and suffixes collisions", () => {
  assert.equal(uniqueName("a.json", ["b.json"]), "a.json");
  assert.equal(uniqueName("a.json", ["a.json"]), "a-2.json");
  assert.equal(uniqueName("a.json", ["a.json", "a-2.json"]), "a-3.json");
  assert.equal(uniqueName("noext", ["noext"]), "noext-2");
  assert.equal(uniqueName(".env", [".env"]), ".env-2");
});

test("safeInputName avoids the reserved name and collisions", () => {
  assert.equal(
    safeInputName("pipeline.json", ["pipeline-2.json"]),
    "pipeline-3.json",
  );
  assert.equal(safeInputName("data.json", ["data.json"]), "data-2.json");
});

test("classifyDropUris: file kept, datalab ignored, others skipped", () => {
  assert.deepEqual(
    classifyDropUris("file:///a/b.csv\r\ndatalab:/s1/x.json\n"),
    {
      files: ["file:///a/b.csv"],
      skipped: 0,
    },
  );
  assert.deepEqual(classifyDropUris("https://example.com/x"), {
    files: [],
    skipped: 1,
  });
  assert.deepEqual(classifyDropUris("# note\n\n   \n  file:///a.txt  \n"), {
    files: ["file:///a.txt"],
    skipped: 0,
  });
});
