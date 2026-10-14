import type { Tool } from "../types";
import { clampInt } from "../util";

export function parseJson(input: string): unknown {
  try {
    return JSON.parse(input);
  } catch (e) {
    throw new Error(
      `Invalid JSON: ${e instanceof Error ? e.message : String(e)}`,
    );
  }
}

function sortDeep(v: unknown): unknown {
  if (Array.isArray(v)) {
    return v.map(sortDeep);
  }
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return Object.fromEntries(
      Object.keys(o)
        .sort()
        .map((k) => [k, sortDeep(o[k])]),
    );
  }
  return v;
}

export const jsonFormat: Tool = {
  id: "json-format",
  title: "JSON Format",
  category: "convert",
  icon: "json",
  keywords: ["pretty", "minify", "beautify"],
  fields: [{ id: "input", label: "Input", multiline: true }],
  options: [
    {
      id: "style",
      label: "Style",
      kind: "select",
      choices: ["pretty", "minify"],
      default: "pretty",
    },
    { id: "indent", label: "Indent", kind: "number", default: 2 },
    { id: "sortKeys", label: "Sort keys", kind: "checkbox", default: false },
  ],
  outputLanguage: "json",
  quickActions: [
    { label: "Format JSON", options: { style: "pretty" } },
    { label: "Minify JSON", options: { style: "minify" } },
  ],
  run({ input = "" }, { style, indent, sortKeys }) {
    let v = parseJson(input);
    if (sortKeys) {
      v = sortDeep(v);
    }
    const n = clampInt(indent, 0, 10, 0);
    return {
      ok: true,
      output: JSON.stringify(v, null, style === "minify" ? 0 : n),
    };
  },
};
