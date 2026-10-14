import type { Tool } from "../types";
import { inferType } from "../../etl/typeInference";
import { parseJson } from "./json";

export const jsonTs: Tool = {
  id: "json-ts",
  title: "JSON → TS Types",
  category: "convert",
  icon: "symbol-interface",
  keywords: ["typescript", "types", "interface"],
  fields: [{ id: "input", label: "Input", multiline: true }],
  outputLanguage: "typescript",
  run({ input = "" }) {
    const v = parseJson(input);
    const t = inferType(v);
    return {
      ok: true,
      output: Array.isArray(v) ? `type Root = ${t};` : `interface Root ${t}`,
    };
  },
};
