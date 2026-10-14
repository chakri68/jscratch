import { test } from "node:test";
import assert from "node:assert/strict";
import { runTool } from "../../../src/tools/registry";
import { uuidV7 } from "../../../src/tools/generate/uuid";

const gen = (id: string, options: Record<string, unknown> = {}, fields: Record<string, string> = {}) =>
  runTool(id, fields, options);

function out(r: ReturnType<typeof gen>): string {
  assert.ok(r.ok, r.ok ? "" : r.error);
  return r.output;
}

test("uuid v4 matches regex", () => {
  assert.match(out(gen("uuid")), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
});

test("uuid v7 matches regex", () => {
  assert.match(
    out(gen("uuid", { version: "v7" })),
    /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );
});

test("uuid v7 sorts by time, including within the same ms", () => {
  const t = 1700000000000;
  const a = uuidV7(t);
  const b = uuidV7(t + 2);
  assert.ok(a < b);
  const same = Array.from({ length: 50 }, () => uuidV7(t + 10));
  assert.deepEqual([...same].sort(), same);
});

test("uuid count and clamping", () => {
  assert.equal(out(gen("uuid", { count: 3 })).split("\n").length, 3);
  assert.equal(out(gen("uuid", { count: 99999 })).split("\n").length, 1000);
  assert.equal(out(gen("uuid", { count: 0 })).split("\n").length, 1);
});

test("timestamp 0 is the epoch", () => {
  assert.ok(out(gen("timestamp", {}, { input: "0" })).includes("1970-01-01T00:00:00.000Z"));
});

test("timestamp seconds vs ms vs fractional", () => {
  const s = out(gen("timestamp", {}, { input: "1700000000" }));
  assert.ok(s.includes("Unix ms: 1700000000000"));
  assert.ok(out(gen("timestamp", {}, { input: "1700000000000" })).includes("Unix s: 1700000000"));
  assert.ok(out(gen("timestamp", {}, { input: "1700000000.5" })).includes("Unix ms: 1700000000500"));
});

test("timestamp output shape and now", () => {
  const lines = out(gen("timestamp", {}, { input: "" })).split("\n");
  assert.deepEqual(
    lines.map((l) => l.split(":")[0]),
    ["ISO", "Local", "Unix s", "Unix ms", "Relative"],
  );
  assert.equal(lines[4], "Relative: just now");
  assert.match(out(gen("timestamp", {}, { input: "1700000000" })), /Relative: \d+d ago/);
});

test("timestamp parses date strings and rejects garbage", () => {
  assert.ok(out(gen("timestamp", {}, { input: "2023-11-14T22:13:20Z" })).includes("Unix s: 1700000000"));
  const r = gen("timestamp", {}, { input: "garbage" });
  assert.ok(!r.ok);
  assert.equal(r.error, "Couldn't parse a date from that input");
});

test("hash sha256 abc and others", () => {
  assert.equal(
    out(gen("hash", {}, { input: "abc" })),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
  assert.equal(out(gen("hash", { algorithm: "md5" }, { input: "abc" })), "900150983cd24fb0d6963f7d28e17f72");
  assert.equal(
    out(gen("hash", { algorithm: "md5", encoding: "base64" }, { input: "abc" })),
    "kAFQmDzST7DWlj99KOF/cg==",
  );
});

test("random respects charsets and length", () => {
  assert.match(out(gen("random", { length: 40, upper: false, lower: false, symbols: false })), /^\d{40}$/);
  assert.equal(out(gen("random")).length, 24);
  assert.equal(out(gen("random", { length: 5000 })).length, 1024);
  assert.match(out(gen("random", { length: 200, upper: false, lower: false, digits: false, symbols: true })), /^[!@#$%^&*()\-_=+[\]{};:,.<>?]{200}$/);
  const r = gen("random", { upper: false, lower: false, digits: false });
  assert.ok(!r.ok);
  assert.match(r.error, /Pick at least one character set/);
});

test("lorem units", () => {
  assert.equal(out(gen("lorem", { unit: "words", count: 5 })).split(" ").length, 5);
  const s = out(gen("lorem", { unit: "sentences", count: 3 }));
  assert.ok(s.startsWith("Lorem ipsum dolor sit amet"));
  assert.equal(s.split(". ").length, 3);
  const p = out(gen("lorem", { unit: "paragraphs", count: 3 })).split("\n\n");
  assert.equal(p.length, 3);
  for (const para of p) {
    const n = para.split(". ").length;
    assert.ok(n >= 4 && n <= 6);
  }
  assert.ok(p[0].startsWith("Lorem ipsum dolor sit amet"));
});
