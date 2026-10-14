import { test } from "node:test";
import assert from "node:assert/strict";
import { allTools, resolveTool, searchTools, runTool, quickActions } from "../../../src/tools/registry";

test("runTool unknown id", () => {
  assert.deepEqual(runTool("nope", {}), { ok: false, error: "Unknown tool: nope" });
});

test("runTool rejects fields over 5 MB", () => {
  const big = "a".repeat(5 * 1024 * 1024 + 1);
  assert.deepEqual(runTool("base64", { input: big }), { ok: false, error: "Input too large (max 5 MB)" });
  assert.equal(runTool("base64", { input: "a".repeat(5 * 1024 * 1024) }).ok, true);
});

test("runTool fills option defaults", () => {
  const r = runTool("base64", { input: "hi" });
  assert.ok(r.ok);
  assert.equal(r.output, "aGk=");
});

test("resolveTool falls back to first tool", () => {
  assert.equal(resolveTool("gone").id, allTools()[0].id);
  assert.equal(resolveTool(undefined).id, allTools()[0].id);
  assert.equal(resolveTool("hex").id, "hex");
});

test("searchTools matches title, keywords, id case-insensitively", () => {
  assert.equal(searchTools("b64")[0].id, "base64");
  assert.equal(searchTools("BEARER")[0].id, "jwt");
  assert.equal(searchTools("").length, allTools().length);
});

test("tools are ordered by category", () => {
  const order = ["encode", "convert", "generate", "inspect"];
  const idx = allTools().map((t) => order.indexOf(t.category));
  assert.deepEqual(idx, [...idx].sort((a, b) => a - b));
});

test("quickActions lists encode and convert actions", () => {
  const labels = quickActions().map((q) => q.action.label);
  assert.deepEqual(labels, ["Base64 Encode", "Base64 Decode", "URL Encode", "URL Decode", "Decode JWT", "Format JSON", "Minify JSON", "JSON → YAML"]);
});

test("a throwing tool becomes ok:false", async () => {
  const mod = await import("../../../src/tools/registry");
  const tools = mod.allTools();
  const boom = { ...tools[0], id: "boom", run: () => { throw new Error("kaboom"); } };
  tools.push(boom);
  try {
    assert.deepEqual(mod.runTool("boom", {}), { ok: false, error: "kaboom" });
  } finally {
    tools.pop();
  }
});

test("runTool ignores undefined option values instead of overriding defaults", () => {
  const fields = { input: "abc" };
  assert.deepEqual(runTool("hash", fields, { algorithm: undefined }), runTool("hash", fields));
  assert.deepEqual(
    runTool("json-format", { input: '{"a":1}' }, { style: undefined, indent: undefined }),
    runTool("json-format", { input: '{"a":1}' }),
  );
});
