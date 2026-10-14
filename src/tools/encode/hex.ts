import type { Tool } from "../types";

export const hex: Tool = {
  id: "hex",
  title: "Hex",
  category: "encode",
  icon: "symbol-numeric",
  keywords: ["bytes", "hexadecimal"],
  fields: [{ id: "input", label: "Input", multiline: true }],
  options: [
    { id: "mode", label: "Mode", kind: "select", choices: ["encode", "decode"], default: "encode" },
  ],
  run({ input = "" }, { mode }) {
    if (mode === "decode") {
      const s = input.replace(/\s+/g, "");
      if (s.length % 2 !== 0 || !/^[0-9a-fA-F]*$/.test(s)) {
        return { ok: false, error: "Invalid hex input" };
      }
      return { ok: true, output: Buffer.from(s, "hex").toString("utf8") };
    }
    return { ok: true, output: Buffer.from(input, "utf8").toString("hex") };
  },
};
