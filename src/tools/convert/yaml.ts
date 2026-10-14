import YAML from "yaml";
import type { Tool } from "../types";
import { parseJson } from "./json";

export const jsonYaml: Tool = {
  id: "json-yaml",
  title: "JSON ⇄ YAML",
  category: "convert",
  icon: "arrow-swap",
  keywords: ["yml"],
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
  outputLanguage: "yaml",
  quickActions: [{ label: "JSON → YAML", options: { direction: "to" } }],
  run({ input = "" }, { direction }) {
    if (direction === "from") {
      return {
        ok: true,
        output: JSON.stringify(YAML.parse(input) ?? null, null, 2),
        meta: "YAML → JSON",
      };
    }
    return {
      ok: true,
      output: YAML.stringify(parseJson(input)).trimEnd(),
      meta: "JSON → YAML",
    };
  },
};
