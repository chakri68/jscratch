import type { ColumnInfo, ColumnType } from "../../preview/schema";
import { h } from "../shared/dom";
import { cellText, truncate, MAX_CELL_CHARS, type Sort } from "./rows";

const CHIPS: Record<ColumnType, string> = {
  number: "123",
  string: "abc",
  boolean: "t/f",
  null: "∅",
  mixed: "≠",
};

// Plain-text cells longer than this get the full text as a tooltip (CSS clips them).
const TOOLTIP_CHARS = 40;

function headerCell(info: ColumnInfo, index: number, sort: Sort | undefined): HTMLElement {
  const dir = sort?.column === index ? sort.dir : undefined;
  const nulls = `${info.nulls.toLocaleString()} ${info.nulls === 1 ? "null" : "nulls"}`;
  return h(
    "th",
    {
      scope: "col",
      tabindex: 0,
      title: `${info.type} · ${nulls}`,
      "aria-sort": dir === "asc" ? "ascending" : dir === "desc" ? "descending" : "none",
      "data-col": index,
      class: `pv-type-${info.type}`,
    },
    [
      h("span", { class: "pv-th" }, [
        h("span", { class: "pv-chip", "aria-hidden": "true" }, [CHIPS[info.type]]),
        h("span", { class: "pv-name" }, [info.name]),
        h("span", { class: "pv-sort", "aria-hidden": "true" }, [
          dir === "asc" ? "▲" : dir === "desc" ? "▼" : "",
        ]),
      ]),
    ],
  );
}

export function renderHead(schema: ColumnInfo[], sort: Sort | undefined): HTMLElement {
  return h("thead", {}, [h("tr", {}, schema.map((c, i) => headerCell(c, i, sort)))]);
}

function cell(v: unknown, numeric: boolean): HTMLElement {
  if (v === null || v === undefined) {
    return h("td", { class: "pv-null" }, ["∅"]);
  }
  const full = cellText(v);
  const json = typeof v === "object";
  const shown = json ? truncate(full) : full;
  const tip = (json && full.length > MAX_CELL_CHARS) || full.length > TOOLTIP_CHARS;
  return h(
    "td",
    { class: numeric ? "pv-num" : json ? "pv-json" : undefined, title: tip ? full : undefined },
    [shown],
  );
}

export function renderBody(
  rows: unknown[][],
  order: number[],
  schema: ColumnInfo[],
): HTMLElement {
  const body = h("tbody");
  if (!order.length) {
    body.append(
      h("tr", {}, [h("td", { class: "pv-empty muted", colspan: schema.length || 1 }, ["No matching rows"])]),
    );
    return body;
  }
  const numeric = schema.map((c) => c.type === "number");
  const frag = document.createDocumentFragment();
  for (const i of order) {
    const row = rows[i];
    frag.append(h("tr", {}, schema.map((_, c) => cell(row[c], numeric[c]))));
  }
  body.append(frag);
  return body;
}
