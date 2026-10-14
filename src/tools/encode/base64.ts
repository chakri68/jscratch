import type { Tool } from "../types";

const STD = /^[A-Za-z0-9+/]*={0,2}$/;
const URLSAFE = /^[A-Za-z0-9\-_]*={0,2}$/;

export const base64: Tool = {
  id: "base64",
  title: "Base64",
  category: "encode",
  icon: "file-binary",
  keywords: ["b64", "atob", "btoa"],
  fields: [{ id: "input", label: "Input", multiline: true }],
  options: [
    { id: "mode", label: "Mode", kind: "select", choices: ["encode", "decode"], default: "encode" },
    { id: "urlSafe", label: "URL-safe", kind: "checkbox", default: false },
  ],
  quickActions: [
    { label: "Base64 Encode", options: { mode: "encode" } },
    { label: "Base64 Decode", options: { mode: "decode" } },
  ],
  run({ input = "" }, { mode, urlSafe }) {
    if (mode === "decode") {
      const s = input.replace(/\s+/g, "");
      // Buffer.from silently drops bad characters, so validate first.
      if (!(urlSafe ? URLSAFE : STD).test(s) || s.replace(/=+$/, "").length % 4 === 1) {
        return { ok: false, error: "Invalid Base64 input" };
      }
      return { ok: true, output: Buffer.from(s, "base64").toString("utf8") };
    }
    const b = Buffer.from(input, "utf8");
    return { ok: true, output: urlSafe ? b.toString("base64url") : b.toString("base64") };
  },
};
