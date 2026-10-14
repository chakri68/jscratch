// Source of the entry point esbuild bundles next to the user's script.
// Logs go to stdout/stderr untouched; the result goes to a file, so a stray
// console.log can't corrupt it.
export const WRAPPER_SOURCE = `
import * as fs from "fs";

const [inputPath, resultPath] = process.argv.slice(2);
(globalThis as any).input = JSON.parse(fs.readFileSync(inputPath, "utf-8"));

function write(obj: unknown) {
  fs.writeFileSync(resultPath, JSON.stringify(obj));
}

async function run() {
  try {
    const { transform } = require("./userTransform");
    const value = await transform();
    if (value === undefined) {
      write({ ok: false, error: "transform() returned undefined \\u2014 did you forget to return?" });
      process.exit(1);
    }
    let json: string | undefined;
    try {
      json = JSON.stringify(value);
    } catch (e: any) {
      const msg = String(e && e.message || e);
      write({ ok: false, error: /circular/i.test(msg)
        ? "Result contains a circular reference: " + msg
        : /BigInt/.test(msg)
          ? "Result contains a BigInt, which JSON can't represent: " + msg
          : "Result isn't JSON-serializable: " + msg });
      process.exit(1);
    }
    if (json === undefined) {
      write({ ok: false, error: "Result isn't JSON-serializable (got " + typeof value + ")" });
      process.exit(1);
    }
    fs.writeFileSync(resultPath, '{"ok":true,"value":' + json + "}");
    process.exit(0);
  } catch (e: any) {
    write({ ok: false, error: String((e && e.stack) || e) });
    process.exit(1);
  }
}

run();
`;
