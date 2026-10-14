import { test } from "node:test";
import assert from "node:assert/strict";
import { planSelect, shouldRender } from "../../../src/webview/toolbox/selectPlan";
import type { ToolMeta } from "../../../src/webview/protocol";

const withField: ToolMeta = {
  id: "base64",
  title: "Base64",
  category: "encode",
  icon: "file-binary",
  fields: [{ id: "input", label: "Input" }],
};
const generator: ToolMeta = { id: "uuid", title: "UUID", category: "generate", icon: "key", fields: [] };

test("planSelect: prefill goes into a tool with a field, and it runs", () => {
  assert.deepEqual(planSelect(withField, "hi"), { fill: "hi", run: true });
});

test("planSelect: generator with a prefill drops the text but still runs", () => {
  assert.deepEqual(planSelect(generator, "selected text"), { fill: undefined, run: true });
});

test("planSelect: a fresh tool runs even without a prefill", () => {
  assert.deepEqual(planSelect(withField), { fill: undefined, run: true });
  assert.deepEqual(planSelect(generator), { fill: undefined, run: true });
});

test("planSelect: re-selecting the same tool without a prefill does nothing", () => {
  assert.deepEqual(planSelect(withField, undefined, false), { fill: undefined, run: false });
});

test("planSelect: an empty-string prefill is still a prefill", () => {
  assert.deepEqual(planSelect(withField, "", false), { fill: "", run: true });
});

test("shouldRender keeps only the latest request", () => {
  assert.equal(shouldRender(3, 3), true);
  assert.equal(shouldRender(2, 3), false);
});
