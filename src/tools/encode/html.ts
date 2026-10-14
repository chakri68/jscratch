import type { Tool } from "../types";

const NAMED: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
};

function fromCodePoint(n: number, orig: string): string {
  return n >= 0 && n <= 0x10ffff && !(n >= 0xd800 && n <= 0xdfff) ? String.fromCodePoint(n) : orig;
}

export const html: Tool = {
  id: "html",
  title: "HTML entities",
  category: "encode",
  icon: "code",
  keywords: ["entities", "escape"],
  fields: [{ id: "input", label: "Input", multiline: true }],
  options: [
    { id: "mode", label: "Mode", kind: "select", choices: ["encode", "decode"], default: "encode" },
  ],
  run({ input = "" }, { mode }) {
    if (mode === "decode") {
      const output = input.replace(
        /&(?:#(\d+)|#[xX]([0-9a-fA-F]+)|([a-zA-Z][a-zA-Z0-9]*));/g,
        (m, dec, hexa, name) => {
          if (dec !== undefined) {
            return fromCodePoint(parseInt(dec, 10), m);
          }
          if (hexa !== undefined) {
            return fromCodePoint(parseInt(hexa, 16), m);
          }
          return Object.prototype.hasOwnProperty.call(NAMED, name) ? NAMED[name] : m;
        },
      );
      return { ok: true, output };
    }
    const output = input
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
    return { ok: true, output };
  },
};
