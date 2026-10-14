import cronstrue from "cronstrue";
import type { Tool } from "../types";

const LIMITS: [number, number][] = [
  [0, 59],
  [0, 23],
  [1, 31],
  [1, 12],
  [0, 7],
];
const NAMES = ["minute", "hour", "day-of-month", "month", "day-of-week"];

function parseField(src: string, idx: number): Set<number> {
  const [lo, hi] = LIMITS[idx];
  const out = new Set<number>();
  const bad = () => new Error(`Invalid ${NAMES[idx]} field: ${src}`);
  const num = (s: string): number => {
    if (!/^\d+$/.test(s)) {
      throw bad();
    }
    const n = Number(s);
    if (n < lo || n > hi) {
      throw bad();
    }
    return n;
  };
  for (const part of src.split(",")) {
    const [range, stepSrc, ...extra] = part.split("/");
    if (extra.length || range === "") {
      throw bad();
    }
    let step = 1;
    if (stepSrc !== undefined) {
      if (!/^\d+$/.test(stepSrc) || Number(stepSrc) < 1) {
        throw bad();
      }
      step = Number(stepSrc);
    }
    let a: number;
    let b: number;
    if (range === "*") {
      [a, b] = [lo, idx === 4 ? 6 : hi];
    } else if (range.includes("-")) {
      const [x, y, ...more] = range.split("-");
      if (more.length) {
        throw bad();
      }
      [a, b] = [num(x), num(y)];
      if (a > b) {
        throw bad();
      }
    } else {
      a = num(range);
      b = stepSrc !== undefined ? hi : a;
    }
    for (let v = a; v <= b; v += step) {
      out.add(idx === 4 && v === 7 ? 0 : v);
    }
  }
  return out;
}

const FIVE_YEARS = 5;

/** Next `n` fire times strictly after `from`, in local time. Throws on invalid expressions. */
export function nextRuns(expr: string, from: Date, n: number): Date[] {
  const parts = expr.trim().split(/\s+/);
  if (parts.length !== 5) {
    throw new Error("Only 5-field cron is supported");
  }
  const [min, hour, dom, mon, dow] = parts.map(parseField);
  const domStar = parts[2].startsWith("*");
  const dowStar = parts[4].startsWith("*");
  const dayOk = (d: Date): boolean => {
    const a = dom.has(d.getDate());
    const b = dow.has(d.getDay());
    return !domStar && !dowStar ? a || b : a && b;
  };

  const limit = new Date(from);
  limit.setFullYear(limit.getFullYear() + FIVE_YEARS);
  const d = new Date(from);
  d.setSeconds(0, 0);
  d.setMinutes(d.getMinutes() + 1);
  const out: Date[] = [];
  while (out.length < n && d <= limit) {
    if (!mon.has(d.getMonth() + 1)) {
      d.setMonth(d.getMonth() + 1, 1);
      d.setHours(0, 0, 0, 0);
    } else if (!dayOk(d)) {
      d.setDate(d.getDate() + 1);
      d.setHours(0, 0, 0, 0);
    } else if (!hour.has(d.getHours())) {
      d.setHours(d.getHours() + 1, 0, 0, 0);
    } else if (!min.has(d.getMinutes())) {
      d.setMinutes(d.getMinutes() + 1);
    } else {
      out.push(new Date(d));
      d.setMinutes(d.getMinutes() + 1);
    }
  }
  return out;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function fmt(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export const cron: Tool = {
  id: "cron",
  title: "Cron Explain",
  category: "inspect",
  icon: "calendar",
  keywords: ["schedule", "crontab"],
  fields: [{ id: "expression", label: "Expression", placeholder: "*/15 * * * *" }],
  run({ expression = "" }) {
    const expr = expression.trim();
    if (expr.startsWith("@") || expr.split(/\s+/).length !== 5) {
      return { ok: false, error: "Only 5-field cron is supported" };
    }
    try {
      const runs = nextRuns(expr, new Date(), 5);
      const desc = cronstrue.toString(expr);
      const list = runs.length ? runs.map(fmt).join("\n") : "No runs in the next 5 years";
      return { ok: true, output: `${desc}\n\nNext runs:\n${list}` };
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
  },
};
