import { JSONPath } from "jsonpath-plus";
import type { Tool } from "../types";
import { parseJson } from "../convert/json";

export const jsonpath: Tool = {
  id: "jsonpath",
  title: "JSONPath",
  category: "inspect",
  icon: "filter",
  keywords: ["query", "jq", "select"],
  fields: [
    { id: "json", label: "JSON", multiline: true },
    { id: "path", label: "Path", placeholder: "$..id" },
  ],
  outputLanguage: "json",
  run({ json = "", path = "" }) {
    const doc = parseJson(json);
    if (doc === null || typeof doc !== "object") {
      return { ok: false, error: "JSONPath needs a JSON object or array" };
    }
    let results: unknown;
    try {
      results = JSONPath({ path, json: doc as object, wrap: true, eval: "safe" });
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const list = Array.isArray(results) ? results : [];
    return {
      ok: true,
      output: JSON.stringify(list, null, 2),
      meta: `${list.length} ${list.length === 1 ? "result" : "results"}`,
    };
  },
};
