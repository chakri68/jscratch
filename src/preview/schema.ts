export type ColumnType = "number" | "string" | "boolean" | "null" | "mixed";

export interface ColumnInfo {
  name: string;
  type: ColumnType;
  nulls: number;
}

// Non-finite numbers get their own kind so NaN next to real numbers reads as
// "mixed", while a column that's nothing but NaN still reads as "number".
type Kind = "number" | "nonfinite" | "string" | "boolean" | "other";

function kindOf(v: unknown): Kind {
  switch (typeof v) {
    case "number":
      return Number.isFinite(v) ? "number" : "nonfinite";
    case "string":
      return "string";
    case "boolean":
      return "boolean";
    default:
      return "other";
  }
}

/**
 * Per-column inferred type and null count over every row. null/undefined (and
 * cells past the end of a short row) count as nulls and don't affect the type.
 */
export function columnSchema(columns: string[], rows: unknown[][]): ColumnInfo[] {
  return columns.map((name, c) => {
    let nulls = 0;
    let kind: Kind | undefined;
    let mixed = false;
    for (const row of rows) {
      const v = row[c];
      if (v === null || v === undefined) {
        nulls++;
        continue;
      }
      if (mixed) {
        continue; // still counting nulls
      }
      const k = kindOf(v);
      if (kind === undefined) {
        kind = k;
      } else if (k !== kind) {
        mixed = true;
      }
    }
    const type: ColumnType =
      kind === undefined
        ? "null"
        : mixed || kind === "other"
          ? "mixed"
          : kind === "nonfinite"
            ? "number"
            : kind;
    return { name, type, nulls };
  });
}

function bytes(n: number): string {
  if (n < 1024) {
    return `${n} B`;
  }
  if (n < 1024 * 1024) {
    return `${(n / 1024).toFixed(1)} KB`;
  }
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/** One-line shape of a value that isn't a table, e.g. "object with 12 keys: a, b, c…". */
export function describeValue(data: unknown): string {
  if (data === null || data === undefined) {
    return String(data);
  }
  if (typeof data === "string") {
    return `string (${bytes(new TextEncoder().encode(data).length)})`;
  }
  if (Array.isArray(data)) {
    return data.length === 0 ? "empty array" : `array of ${plural(data.length, "item")}`;
  }
  if (typeof data === "object") {
    const keys = Object.keys(data);
    if (keys.length === 0) {
      return "empty object";
    }
    const head = keys.slice(0, 3).join(", ");
    return `object with ${plural(keys.length, "key")}: ${head}${keys.length > 3 ? "…" : ""}`;
  }
  return `${typeof data}: ${String(data)}`;
}
