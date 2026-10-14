import { randomBytes, randomInt, randomUUID } from "node:crypto";
import type { Tool } from "../types";
import { clampInt } from "../util";

let lastMs = -1;
let counter = 0;

/** UUID v7 (RFC 9562): 48-bit ms timestamp, rand_a is a 12-bit counter so same-ms ids still sort. */
export function uuidV7(now: number = Date.now()): string {
  let ms = Math.max(now, lastMs);
  if (ms === lastMs) {
    counter++;
    if (counter > 0xfff) {
      // counter exhausted: borrow the next millisecond
      ms++;
      counter = randomInt(0, 0x800);
    }
  } else {
    counter = randomInt(0, 0x800); // seeded below the midpoint to leave headroom
  }
  lastMs = ms;
  const b = randomBytes(16);
  b.writeUIntBE(ms, 0, 6);
  b[6] = 0x70 | (counter >> 8);
  b[7] = counter & 0xff;
  b[8] = 0x80 | (b[8] & 0x3f);
  const h = b.toString("hex");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export const uuid: Tool = {
  id: "uuid",
  title: "UUID",
  category: "generate",
  icon: "symbol-key",
  keywords: ["guid", "v4", "v7"],
  fields: [],
  options: [
    { id: "version", label: "Version", kind: "select", choices: ["v4", "v7"], default: "v4" },
    { id: "count", label: "Count", kind: "number", default: 1 },
  ],
  run(_fields, { version, count }) {
    const n = clampInt(count, 1, 1000, 1);
    const gen = version === "v7" ? uuidV7 : randomUUID;
    return { ok: true, output: Array.from({ length: n }, () => gen()).join("\n") };
  },
};
