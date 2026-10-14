import type { Tool } from "../types";

function span(secs: number): string {
  const units: [string, number][] = [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]];
  for (const [u, n] of units) {
    if (secs >= n) {
      return `${Math.floor(secs / n)}${u}`;
    }
  }
  return "0s";
}

function relative(ms: number): string {
  const diff = Math.trunc((ms - Date.now()) / 1000);
  if (diff === 0) {
    return "just now";
  }
  return diff > 0 ? `in ${span(diff)}` : `${span(-diff)} ago`;
}

function parse(input: string): number {
  const s = input.trim();
  if (!s) {
    return Date.now();
  }
  if (/^-?\d+(\.\d+)?$/.test(s)) {
    const n = Number(s);
    // up to 1e11 is seconds (year ~5138); anything larger is ms. Fractions are seconds.
    return Math.abs(n) <= 1e11 || s.includes(".") ? Math.round(n * 1000) : n;
  }
  return Date.parse(s);
}

export const timestamp: Tool = {
  id: "timestamp",
  title: "Timestamp",
  category: "generate",
  icon: "clock",
  keywords: ["epoch", "unix", "date", "iso"],
  fields: [
    { id: "input", label: "Input", placeholder: "empty = now; epoch s/ms or a date string" },
  ],
  run({ input = "" }) {
    const ms = parse(input);
    const d = new Date(ms);
    if (!Number.isFinite(ms) || Number.isNaN(d.getTime())) {
      return { ok: false, error: "Couldn't parse a date from that input" };
    }
    return {
      ok: true,
      output: [
        `ISO: ${d.toISOString()}`,
        `Local: ${d.toLocaleString()}`,
        `Unix s: ${Math.floor(ms / 1000)}`,
        `Unix ms: ${ms}`,
        `Relative: ${relative(ms)}`,
      ].join("\n"),
    };
  },
};
