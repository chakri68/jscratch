/** Pure row logic for the preview table: text, sort, filter, footer. No DOM. */

export type SortDir = "asc" | "desc";
export interface Sort {
  column: number;
  dir: SortDir;
}

export const MAX_CELL_CHARS = 120;

const collator = new Intl.Collator(undefined, { numeric: true });

/** Full text of a cell: "" for null/undefined, compact JSON for objects and arrays. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) {
    return "";
  }
  if (typeof v === "object") {
    try {
      return JSON.stringify(v) ?? String(v);
    } catch {
      return String(v); // cycles can't come out of a parser, but be safe
    }
  }
  return String(v);
}

export function truncate(s: string, max = MAX_CELL_CHARS): string {
  return s.length > max ? `${s.slice(0, max - 1)}…` : s;
}

/** Header click: asc → desc → none; a different column starts at asc. */
export function nextSort(sort: Sort | undefined, column: number): Sort | undefined {
  if (!sort || sort.column !== column) {
    return { column, dir: "asc" };
  }
  return sort.dir === "asc" ? { column, dir: "desc" } : undefined;
}

const isNull = (v: unknown) => v === null || v === undefined;

function compare(a: unknown, b: unknown): number {
  if (typeof a === "number" && typeof b === "number") {
    // NaN has no order; park it after real numbers.
    if (Number.isNaN(a) || Number.isNaN(b)) {
      return Number(Number.isNaN(a)) - Number(Number.isNaN(b));
    }
    return a - b;
  }
  return collator.compare(cellText(a), cellText(b));
}

/** Row indexes in display order. Nulls go last in both directions; ties keep file order. */
export function sortIndexes(rows: unknown[][], indexes: number[], sort: Sort | undefined): number[] {
  if (!sort) {
    return indexes;
  }
  const { column, dir } = sort;
  const sign = dir === "asc" ? 1 : -1;
  return [...indexes].sort((i, j) => {
    const a = rows[i][column];
    const b = rows[j][column];
    if (isNull(a) || isNull(b)) {
      return Number(isNull(a)) - Number(isNull(b));
    }
    return sign * compare(a, b);
  });
}

/** One lowercased string per row, for substring filtering. */
export function haystacks(rows: unknown[][]): string[] {
  return rows.map((r) => r.map(cellText).join("\t").toLowerCase());
}

/** Indexes of rows containing `query` (case-insensitive). Empty query matches all. */
export function filterIndexes(hay: string[], query: string): number[] {
  const q = query.toLowerCase();
  const out: number[] = [];
  for (let i = 0; i < hay.length; i++) {
    if (!q || hay[i].includes(q)) {
      out.push(i);
    }
  }
  return out;
}

export function footerText(
  shown: number,
  totalRows: number,
  columns: number,
  matched?: number,
): string {
  const base = `showing ${shown.toLocaleString()} of ${totalRows.toLocaleString()} rows · ${columns.toLocaleString()} columns`;
  return matched === undefined ? base : `${matched.toLocaleString()} matching · ${base}`;
}
