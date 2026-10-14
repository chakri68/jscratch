import "@vscode-elements/elements/dist/vscode-button/index.js";
import "@vscode-elements/elements/dist/vscode-textfield/index.js";
import type { PreviewFromWebview, PreviewToWebview } from "./protocol";
import { h, isTyping } from "./shared/dom";
import { makeGuard } from "./shared/guard";
import {
  filterIndexes,
  footerText,
  haystacks,
  nextSort,
  sortIndexes,
  type Sort,
  type SortDir,
} from "./preview/rows";
import { renderBody, renderHead } from "./preview/table";

declare function acquireVsCodeApi(): {
  postMessage(msg: PreviewFromWebview): void;
  getState(): unknown;
  setState(state: unknown): void;
};

type Data = Extract<PreviewToWebview, { type: "data" }>;

/** Survives the webview reloading when the panel is hidden and shown again. */
interface State {
  filter: string;
  // By column name, so it still applies after a re-run reorders columns.
  sort?: { name: string; dir: SortDir };
}

const FILTER_DEBOUNCE_MS = 100;
const vscode = acquireVsCodeApi();
const app = document.getElementById("app") as HTMLElement;
const state: State = { filter: "", ...(vscode.getState() as Partial<State> | undefined) };

let data: Data | undefined;
let hay: string[] = [];
let sort: Sort | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
let view:
  | {
      table: HTMLTableElement;
      footer: HTMLElement;
      filter: HTMLInputElement;
      file: HTMLElement;
      warn: HTMLElement;
    }
  | undefined;

const guard = makeGuard(reportError);

function reportError(e: unknown): void {
  console.error(e);
  const message = `Preview error: ${e instanceof Error ? e.message : String(e)}`;
  const box =
    app.querySelector(".pv-error") ??
    app.appendChild(h("div", { class: "pv-error", role: "alert" }));
  box.textContent = message;
}

function post(msg: PreviewFromWebview): void {
  vscode.postMessage(msg);
}

function save(): void {
  const s = sort && data ? { name: data.columns[sort.column], dir: sort.dir } : undefined;
  state.sort = s;
  vscode.setState(state);
}

// --- tabular ----------------------------------------------------------------

function showData(msg: Data): void {
  // Fresh data supersedes whatever failed last time.
  app.querySelector(".pv-error")?.remove();
  data = msg;
  hay = haystacks(msg.rows);
  const col = state.sort ? msg.columns.indexOf(state.sort.name) : -1;
  sort = state.sort && col >= 0 ? { column: col, dir: state.sort.dir } : undefined;
  // Re-runs land here too: keep the shell (filter focus, scroll), swap the contents.
  const v = view ?? mount();
  v.file.textContent = msg.file;
  v.warn.textContent = msg.warning ?? "";
  v.warn.title = msg.warning ?? "";
  v.warn.hidden = !msg.warning;
  renderRows();
}

function mount(): NonNullable<typeof view> {
  const filter = h("vscode-textfield", {
    placeholder: "Filter rows",
    "aria-label": "Filter rows",
  }) as unknown as HTMLInputElement;
  filter.value = state.filter;
  filter.addEventListener(
    "input",
    guard(() => {
      clearTimeout(timer);
      timer = setTimeout(
        guard(() => {
          state.filter = filter.value;
          save();
          renderRows();
        }),
        FILTER_DEBOUNCE_MS,
      );
    }),
  );
  const table = h("table", { class: "pv-table" });
  table.addEventListener("click", guard(onHeaderEvent));
  table.addEventListener("keydown", guard(onHeaderEvent));
  const file = h("span", { class: "pv-file" });
  const warn = h("span", { class: "pv-warn" });
  const footer = h("div", { class: "pv-foot muted", role: "status" });
  app.replaceChildren(
    h("div", { class: "pv" }, [
      h("div", { class: "pv-bar" }, [file, warn, filter]),
      h("div", { class: "pv-scroll" }, [table]),
      footer,
    ]),
  );
  view = { table, footer, filter, file, warn };
  return view;
}

function renderRows(): void {
  if (!data || !view) {
    return;
  }
  const query = state.filter;
  const matched = filterIndexes(hay, query);
  const order = sortIndexes(data.rows, matched, sort);
  view.table.replaceChildren(renderHead(data.schema, sort), renderBody(data.rows, order, data.schema));
  view.footer.textContent = footerText(
    data.rows.length,
    data.totalRows,
    data.columns.length,
    query ? matched.length : undefined,
  );
}

function onHeaderEvent(e: Event): void {
  if (e instanceof KeyboardEvent && e.key !== "Enter" && e.key !== " ") {
    return;
  }
  const th = (e.target as Element | null)?.closest("th[data-col]");
  if (!th) {
    return;
  }
  e.preventDefault();
  const column = Number(th.getAttribute("data-col"));
  sort = nextSort(sort, column);
  save();
  renderRows();
  // The header was rebuilt; keep keyboard focus on the same column.
  if (e instanceof KeyboardEvent) {
    view?.table.querySelector<HTMLElement>(`th[data-col="${column}"]`)?.focus();
  }
}

// --- not tabular --------------------------------------------------------------

function showNotTabular(msg: Extract<PreviewToWebview, { type: "notTabular" }>): void {
  data = undefined;
  view = undefined;
  const open = h("vscode-button", {}, ["Open as text"]);
  open.addEventListener("click", guard(() => post({ type: "openAsText" })));
  app.replaceChildren(
    h("div", { class: "pv-not" }, [
      h("h2", {}, ["Not tabular"]),
      h("p", { class: "pv-file" }, [msg.file]),
      h("p", {}, [msg.summary]),
      msg.warning ? h("p", { class: "pv-warn" }, [msg.warning]) : null,
      open,
    ]),
  );
}

// --- messaging ------------------------------------------------------------------

document.addEventListener(
  "keydown",
  guard((e: KeyboardEvent) => {
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e) && view) {
      e.preventDefault();
      view.filter.focus();
    }
  }),
);

window.addEventListener(
  "message",
  guard((event: MessageEvent<PreviewToWebview>) => {
    const msg = event.data;
    switch (msg.type) {
      case "data":
        showData(msg);
        break;
      case "notTabular":
        showNotTabular(msg);
        break;
    }
  }),
);

app.replaceChildren(h("p", { class: "pv-loading muted" }, ["Loading…"]));
post({ type: "ready" });
