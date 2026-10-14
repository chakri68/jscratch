import { randomInt } from "node:crypto";
import type { Tool } from "../types";

const SETS: [string, string][] = [
  ["upper", "ABCDEFGHIJKLMNOPQRSTUVWXYZ"],
  ["lower", "abcdefghijklmnopqrstuvwxyz"],
  ["digits", "0123456789"],
  ["symbols", "!@#$%^&*()-_=+[]{};:,.<>?"],
];

export const random: Tool = {
  id: "random",
  title: "Random String",
  category: "generate",
  icon: "symbol-misc",
  keywords: ["password", "token", "secret"],
  fields: [],
  options: [
    { id: "length", label: "Length", kind: "number", default: 24 },
    { id: "upper", label: "Uppercase", kind: "checkbox", default: true },
    { id: "lower", label: "Lowercase", kind: "checkbox", default: true },
    { id: "digits", label: "Digits", kind: "checkbox", default: true },
    { id: "symbols", label: "Symbols", kind: "checkbox", default: false },
  ],
  run(_fields, options) {
    const pool = SETS.filter(([id]) => options[id]).map(([, chars]) => chars).join("");
    if (!pool) {
      return { ok: false, error: "Pick at least one character set" };
    }
    const n = Math.min(1024, Math.max(1, Math.floor(Number(options.length)) || 1));
    let out = "";
    for (let i = 0; i < n; i++) {
      out += pool[randomInt(pool.length)];
    }
    return { ok: true, output: out };
  },
};
