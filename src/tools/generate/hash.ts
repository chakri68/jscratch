import { createHash } from "node:crypto";
import type { Tool } from "../types";

export const hash: Tool = {
  id: "hash",
  title: "Hash",
  category: "generate",
  icon: "shield",
  keywords: ["md5", "sha", "sha256", "digest", "checksum"],
  fields: [{ id: "input", label: "Input", multiline: true }],
  options: [
    {
      id: "algorithm",
      label: "Algorithm",
      kind: "select",
      choices: ["md5", "sha1", "sha256", "sha512"],
      default: "sha256",
    },
    { id: "encoding", label: "Encoding", kind: "select", choices: ["hex", "base64"], default: "hex" },
  ],
  run({ input = "" }, { algorithm, encoding }) {
    const alg = String(algorithm);
    if (!["md5", "sha1", "sha256", "sha512"].includes(alg)) {
      return { ok: false, error: `Unsupported algorithm: ${alg}` };
    }
    const enc = encoding === "base64" ? "base64" : "hex";
    return { ok: true, output: createHash(alg).update(input, "utf8").digest(enc) };
  },
};
