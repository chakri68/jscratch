import { parse, stringify } from "smol-toml";
import type { Tool } from "../types";
import { parseJson } from "./json";

export const jsonToml: Tool = {
  id: "json-toml",
  title: "JSON ⇄ TOML",
  category: "convert",
  icon: "settings",
  keywords: ["config", "ini"],
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
  outputLanguage: "toml",
  run({ input = "" }, { direction }) {
    if (direction === "from") {
      return {
        ok: true,
        output: JSON.stringify(parse(input), null, 2),
        meta: "TOML → JSON",
      };
    }
    const v = parseJson(input);
    if (v === null || typeof v !== "object" || Array.isArray(v)) {
      return { ok: false, error: "TOML needs an object at the top level" };
    }
    return { ok: true, output: stringify(v).trimEnd(), meta: "JSON → TOML" };
  },
};
