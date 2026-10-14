import type { Tool } from "../types";

const MAX_LINES = 5000;

const toLines = (s: string): string[] => (s === "" ? [] : s.split("\n"));

function lcsLength(a: string[], b: string[]): number {
  let prev = new Int32Array(b.length + 1);
  let cur = new Int32Array(b.length + 1);
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      cur[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], cur[j - 1]);
    }
    [prev, cur] = [cur, prev];
  }
  return prev[b.length];
}

export const diff: Tool = {
  id: "diff",
  title: "Text Diff",
  category: "inspect",
  icon: "diff",
  keywords: ["compare", "delta"],
  fields: [
    { id: "left", label: "Left", multiline: true },
    { id: "right", label: "Right", multiline: true },
  ],
  run({ left = "", right = "" }) {
    const a = toLines(left);
    const b = toLines(right);
    if (a.length > MAX_LINES || b.length > MAX_LINES) {
      return { ok: false, error: "Too many lines to diff here — use Open Diff" };
    }
    const common = lcsLength(a, b);
    const added = b.length - common;
    const removed = a.length - common;
    return {
      ok: true,
      output: "",
      meta: added === 0 && removed === 0 ? "No differences" : `+${added} −${removed} lines`,
    };
  },
};
