import type { Tool } from "../types";

export const url: Tool = {
  id: "url",
  title: "URL",
  category: "encode",
  icon: "link",
  keywords: ["percent", "uri", "encodeURIComponent"],
  fields: [{ id: "input", label: "Input", multiline: true }],
  options: [
    { id: "mode", label: "Mode", kind: "select", choices: ["encode", "decode"], default: "encode" },
    { id: "scope", label: "Scope", kind: "select", choices: ["component", "uri"], default: "component" },
  ],
  quickActions: [
    { label: "URL Encode", options: { mode: "encode" } },
    { label: "URL Decode", options: { mode: "decode" } },
  ],
  run({ input = "" }, { mode, scope }) {
    const uri = scope === "uri";
    try {
      if (mode === "decode") {
        return { ok: true, output: uri ? decodeURI(input) : decodeURIComponent(input) };
      }
      return { ok: true, output: uri ? encodeURI(input) : encodeURIComponent(input) };
    } catch {
      return { ok: false, error: "Invalid URL encoding" };
    }
  },
};
