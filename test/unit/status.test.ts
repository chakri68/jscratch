import { test } from "node:test";
import { strict as assert } from "node:assert";
import { nodeStatus } from "../../src/etl/status";
import type { PipelineNode } from "../../src/etl/model";

const t = (lastRun?: PipelineNode["lastRun"]): PipelineNode => ({
  id: "1",
  type: "transform",
  label: "t",
  filename: "transform-1.ts",
  lastRun,
});

test("never: transform without lastRun", () => {
  assert.equal(nodeStatus(t(), 0, 0), "never");
});

test("never: non-transform nodes", () => {
  const run = { at: 10, ok: true, durationMs: 1 };
  for (const type of ["input", "output"] as const) {
    const n = { ...t(run), type };
    assert.equal(nodeStatus(n, 0, 0), "never");
  }
});

test("ok: last run succeeded and nothing changed since", () => {
  assert.equal(nodeStatus(t({ at: 10, ok: true, durationMs: 1 }), 10, 5), "ok");
});

test("failed: last run failed and nothing changed since", () => {
  assert.equal(
    nodeStatus(t({ at: 10, ok: false, durationMs: 1, error: "x" }), 3, 3),
    "failed",
  );
});

test("stale: self or parent modified after the run, wins over ok/failed", () => {
  const ok = t({ at: 10, ok: true, durationMs: 1 });
  const bad = t({ at: 10, ok: false, durationMs: 1 });
  assert.equal(nodeStatus(ok, 11, 0), "stale");
  assert.equal(nodeStatus(ok, 0, 11), "stale");
  assert.equal(nodeStatus(bad, 0, 11), "stale");
});
