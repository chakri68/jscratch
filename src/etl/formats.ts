import Papa from "papaparse";

export type DataFormat = "json" | "csv" | "ndjson" | "txt";

const EXTENSIONS: Record<string, DataFormat> = {
  ".json": "json",
  ".csv": "csv",
  ".ndjson": "ndjson",
  ".jsonl": "ndjson",
  ".txt": "txt",
};

export function formatFromFilename(name: string): DataFormat | undefined {
  const dot = name.lastIndexOf(".");
  if (dot === -1) {
    return undefined;
  }
  return EXTENSIONS[name.slice(dot).toLowerCase()];
}

function lines(raw: string): string[] {
  return raw.split("\n").map((l) => l.replace(/\r$/, ""));
}

class NdjsonError extends Error {}

export function parse(
  filename: string,
  raw: string,
): { data: unknown; warning?: string } {
  const format = formatFromFilename(filename);
  try {
    switch (format) {
      case "json":
        return { data: JSON.parse(raw) };
      case "csv": {
        const result = Papa.parse(raw, {
          header: true,
          dynamicTyping: true,
          skipEmptyLines: true,
        });
        const fatal = result.errors.find((e) => e.type === "Quotes");
        if (fatal) {
          return {
            data: raw,
            warning: `Invalid CSV in ${filename}: ${fatal.message}`,
          };
        }
        // UndetectableDelimiter is expected for single-column files; ignore it.
        const soft = result.errors.find((e) => e.type === "FieldMismatch");
        if (soft) {
          return {
            data: result.data,
            warning: `CSV row ${(soft.row ?? 0) + 1}: ${soft.message}`,
          };
        }
        return { data: result.data };
      }
      case "ndjson":
        return {
          data: lines(raw).flatMap((l, i) => {
            if (l.trim() === "") {
              return [];
            }
            try {
              return [JSON.parse(l)];
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e);
              throw new NdjsonError(`Invalid NDJSON at line ${i + 1}: ${msg}`);
            }
          }),
        };
      case "txt":
        return { data: lines(raw) };
      default:
        return { data: raw };
    }
  } catch (e) {
    if (e instanceof NdjsonError) {
      return { data: raw, warning: e.message };
    }
    const msg = e instanceof Error ? e.message : String(e);
    return { data: raw, warning: `Invalid JSON in ${filename}: ${msg}` };
  }
}

export function serialize(format: DataFormat, value: unknown): string {
  switch (format) {
    case "json":
      return JSON.stringify(value ?? null, null, 2);
    case "csv":
      if (
        !Array.isArray(value) ||
        !value.every((r) => typeof r === "object" && r !== null)
      ) {
        throw new Error("CSV needs an array of objects or arrays");
      }
      return Papa.unparse(value as object[] | unknown[][]);
    case "ndjson":
      if (!Array.isArray(value)) {
        throw new Error("NDJSON needs an array");
      }
      return value.map((v) => JSON.stringify(v)).join("\n");
    case "txt":
      if (Array.isArray(value)) {
        return value
          .map((v) => (typeof v === "string" ? v : JSON.stringify(v)))
          .join("\n");
      }
      return typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }
}

export function guessFormat(text: string): DataFormat {
  try {
    JSON.parse(text);
    return "json";
  } catch {
    // not json
  }
  const ls = lines(text).filter((l) => l.trim() !== "");
  if (ls.length >= 2 && ls.filter((l) => l.includes(",")).length > ls.length / 2) {
    return "csv";
  }
  return "txt";
}

export function tabulate(
  data: unknown,
): { columns: string[]; rows: unknown[][] } | undefined {
  if (!Array.isArray(data) || data.length === 0) {
    return undefined;
  }
  if (data.every((r) => typeof r === "object" && r !== null && !Array.isArray(r))) {
    const columns: string[] = [];
    const seen = new Set<string>();
    for (const r of data as Record<string, unknown>[]) {
      for (const k of Object.keys(r)) {
        if (!seen.has(k)) {
          seen.add(k);
          columns.push(k);
        }
      }
    }
    return {
      columns,
      rows: (data as Record<string, unknown>[]).map((r) =>
        columns.map((c) => r[c]),
      ),
    };
  }
  if (data.every((r) => Array.isArray(r))) {
    const width = (data as unknown[][]).reduce((m, r) => Math.max(m, r.length), 0);
    return {
      columns: Array.from({ length: width }, (_, i) => String(i + 1)),
      rows: data as unknown[][],
    };
  }
  return undefined;
}
