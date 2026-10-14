import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { allTools } from "../../src/tools/registry";

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "../../package.json"), "utf8"));
const commands: { command: string; title: string; category?: string }[] = pkg.contributes.commands;

const expected = allTools().flatMap((t) =>
  (t.quickActions ?? []).map((a, i) => ({ id: `jscratch.quick.${t.id}.${i}`, label: a.label })),
);

test("jscratch.quick.* commands match the tools' quickActions", () => {
  const declared = commands.filter((c) => c.command.startsWith("jscratch.quick."));
  assert.deepEqual(
    declared.map((c) => c.command).sort(),
    expected.map((e) => e.id).sort(),
  );
  for (const e of expected) {
    const c = declared.find((d) => d.command === e.id);
    assert.equal(c?.title, e.label);
    assert.equal(c?.category, "JScratch");
  }
});

test("every quick command is in the editor submenu and hidden from the palette", () => {
  const sub: { command: string }[] = pkg.contributes.menus["jscratch.editorSubmenu"];
  const palette: { command: string; when: string }[] = pkg.contributes.menus.commandPalette;
  for (const e of expected) {
    assert.ok(sub.some((m) => m.command === e.id), `${e.id} missing from submenu`);
    assert.ok(palette.some((m) => m.command === e.id && m.when === "false"), `${e.id} visible in palette`);
  }
});

test("every contributed command has category JScratch", () => {
  for (const c of commands) {
    assert.equal(c.category, "JScratch", c.command);
  }
});
