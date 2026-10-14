import { test } from "node:test";
import { strict as assert } from "node:assert";
import { transformTemplate, replaceTypeDefs } from "../../src/etl/templates";

test("replaceTypeDefs swaps only the type block", () => {
  const before = transformTemplate("any");
  const after = replaceTypeDefs(before, "number");
  assert.ok(after !== undefined);
  if (after === undefined) {
    return;
  }
  assert.ok(after.includes("data: number;"));
  assert.equal(after.replace("data: number;", "data: any;"), before);
});

test("replaceTypeDefs returns undefined without a block", () => {
  assert.equal(replaceTypeDefs("no block", "x"), undefined);
});
