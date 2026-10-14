import type { Tool } from "../types";

const CAP = 1000;

/** Name (or undefined) for each capture group, in order, found by scanning the pattern source. */
function groupNames(src: string): (string | undefined)[] {
  const out: (string | undefined)[] = [];
  let inClass = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\") {
      i++;
    } else if (inClass) {
      inClass = c !== "]";
    } else if (c === "[") {
      inClass = true;
    } else if (c === "(") {
      if (src[i + 1] !== "?") {
        out.push(undefined);
      } else {
        const named = /^\(\?<([^>=!]+)>/.exec(src.slice(i));
        if (named) {
          out.push(named[1]);
        }
      }
    }
  }
  return out;
}

export const regex: Tool = {
  id: "regex",
  title: "Regex Tester",
  category: "inspect",
  icon: "regex",
  keywords: ["regexp", "match", "pattern"],
  fields: [
    { id: "pattern", label: "Pattern", placeholder: "\\d+" },
    { id: "flags", label: "Flags", placeholder: "i" },
    { id: "text", label: "Text", multiline: true },
  ],
  run({ pattern = "", flags = "", text = "" }) {
    const f = [...new Set((flags + "g").split(""))].join("");
    let re: RegExp;
    try {
      re = new RegExp(pattern, f);
    } catch (e) {
      return { ok: false, error: e instanceof Error ? e.message : String(e) };
    }
    const unicode = /[uv]/.test(re.flags);
    const names = groupNames(pattern);
    const lines: string[] = [];
    const ranges: [number, number][] = [];
    let capped = false;
    let m: RegExpExecArray | null;
    while ((m = re.exec(text)) !== null) {
      if (ranges.length >= CAP) {
        capped = true;
        break;
      }
      const start = m.index;
      const end = start + m[0].length;
      ranges.push([start, end]);
      lines.push(`#${ranges.length} [${start}-${end}] ${JSON.stringify(m[0])}`);
      for (let i = 1; i < m.length; i++) {
        if (m[i] !== undefined) {
          lines.push(`  ${names[i - 1] ?? `$${i}`} = ${JSON.stringify(m[i])}`);
        }
      }
      if (m[0] === "") {
        const cp = unicode ? text.codePointAt(re.lastIndex) : undefined;
        re.lastIndex += cp !== undefined && cp > 0xffff ? 2 : 1;
      }
    }
    const n = ranges.length;
    return {
      ok: true,
      output: lines.join("\n"),
      meta: capped ? `${CAP}+ matches (capped)` : `${n} ${n === 1 ? "match" : "matches"}`,
      data: { ranges },
    };
  },
};
