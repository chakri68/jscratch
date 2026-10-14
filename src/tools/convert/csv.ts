import type { Tool } from "../types";
import { parse, serialize } from "../../etl/formats";
import { parseJson } from "./json";

export const jsonCsv: Tool = {
  id: "json-csv",
  title: "JSON ⇄ CSV",
  category: "convert",
  icon: "table",
  keywords: ["spreadsheet", "comma"],
  fields: [{ id: "input", label: "Input", multiline: true }],
  options: [
    {
      id: "direction",
      label: "Direction",
      kind: "select",
      choices: ["to", "from"],
      default: "to",
    },
  ],
  outputLanguage: "csv",
  run({ input = "" }, { direction }) {
    if (direction === "from") {
      const { data, warning } = parse("input.csv", input);
      if (typeof data === "string") {
        return { ok: false, error: warning ?? "Invalid CSV" };
      }
      return {
        ok: true,
        output: JSON.stringify(data, null, 2),
        meta: "CSV → JSON",
      };
    }
    return {
      ok: true,
      output: serialize("csv", parseJson(input)),
      meta: "JSON → CSV",
    };
  },
};
