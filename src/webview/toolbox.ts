import type { ToolResult } from "../tools/types";
import type { ToolboxFromWebview, ToolboxToWebview, ToolMeta } from "./protocol";
import { h, isTyping } from "./shared/dom";
import { makeGuard } from "./shared/guard";
import { Rail } from "./toolbox/rail";
import { renderPane, valuesFor, type Pane, type ToolValues } from "./toolbox/pane";
import { planSelect, shouldRender } from "./toolbox/selectPlan";

declare function acquireVsCodeApi(): {
  postMessage(msg: ToolboxFromWebview): void;
  getState(): unknown;
  setState(state: unknown): void;
};

interface State {
  selected?: string;
  values: Record<string, ToolValues>;
}

const DEBOUNCE_MS = 150;
const vscode = acquireVsCodeApi();
const app = document.getElementById("app") as HTMLElement;

const state: State = { values: {}, ...(vscode.getState() as Partial<State> | undefined) };
let tools: ToolMeta[] = [];
let rail: Rail | undefined;
let tool: ToolMeta | undefined;
let pane: Pane | undefined;
let requestId = 0;
// Fields each request was computed from, for the latest request only (stale ones are dropped).
let sentFields: Record<string, string> = {};
let timer: ReturnType<typeof setTimeout> | undefined;

/** Runs `fn`, and puts any exception in the error box rather than blanking the UI. */
const guard = makeGuard(reportError);

function reportError(e: unknown): void {
  console.error(e);
  const message = `Toolbox error: ${e instanceof Error ? e.message : String(e)}`;
  if (pane) {
    pane.output.showError(message);
  } else {
    app.replaceChildren(h("div", { class: "tb-error", role: "alert" }, [message]));
  }
}

function save(): void {
  vscode.setState(state);
}

function current(): ToolValues {
  if (!tool) {
    throw new Error("No tool selected");
  }
  return (state.values[tool.id] ??= valuesFor(tool, undefined));
}

function find(id: string | undefined): ToolMeta | undefined {
  return tools.find((t) => t.id === id);
}

// --- layout ---------------------------------------------------------------

function mount(): void {
  document.body.classList.add("tb-body");
  rail = new Rail(tools, guard((id: string) => select(id)));
  rail.search.addEventListener("input", guard(() => rail?.filter(rail.search.value)));
  rail.search.addEventListener("keydown", guard(onSearchKey));
  app.replaceChildren(
    h("div", { class: "tb" }, [rail.narrowEl, rail.el, h("div", { class: "tb-pane-slot" })]),
  );
}

function select(id: string, opts: { prefill?: string; focus?: boolean } = {}): void {
  const next = find(id) ?? tools[0];
  if (!next || !rail) {
    return;
  }
  const changed = next.id !== tool?.id || !pane;
  tool = next;
  state.selected = next.id;
  if (changed) {
    requestId++; // whatever was in flight belongs to the old pane
    clearTimeout(timer);
    state.values[next.id] = valuesFor(next, state.values[next.id]);
    pane = renderPane(next, state.values[next.id], {
      field: guard(onField),
      option: guard(onOption),
      helper: guard(onHelper),
      generate: guard(() => run()),
      action: guard((kind, text) =>
        post({ type: kind, text, toolId: next.id, options: current().options }),
      ),
      openDiff: guard(() => {
        const f = current().fields;
        post({ type: "openDiff", left: f.left ?? "", right: f.right ?? "" });
      }),
    });
    app.querySelector(".tb-pane-slot")?.replaceChildren(pane.el);
    rail.setActive(next.id);
    post({ type: "selected", toolId: next.id });
  }
  const plan = planSelect(next, opts.prefill, changed);
  if (plan.fill !== undefined) {
    setFirst(plan.fill);
  }
  if (plan.run) {
    run();
  }
  save();
  if (opts.focus) {
    pane?.focusFirst();
  }
}

// --- running --------------------------------------------------------------

function schedule(): void {
  clearTimeout(timer);
  timer = setTimeout(guard(run), DEBOUNCE_MS);
}

function run(): void {
  clearTimeout(timer);
  if (!tool) {
    return;
  }
  const { fields, options } = current();
  sentFields = { ...fields };
  // options never hold undefined (onOption deletes instead), so defaults survive the merge.
  post({ type: "run", requestId: ++requestId, toolId: tool.id, fields: sentFields, options: { ...options } });
}

function onResult(id: number, result: ToolResult): void {
  if (!shouldRender(id, requestId) || !pane || !tool) {
    return; // superseded by a newer run, or the tool changed
  }
  const blank = tool.fields.length > 0 && Object.values(sentFields).every((v) => v === "");
  if (!result.ok && blank) {
    pane.output.showHint(); // "Invalid JSON" before you've typed anything is just noise
  } else {
    pane.output.show(result, sentFields);
  }
}

// --- input handlers -------------------------------------------------------

function onField(id: string, value: string): void {
  current().fields[id] = value;
  save();
  schedule();
}

function onOption(id: string, value: string | number | boolean | undefined): void {
  const options = current().options;
  if (value === undefined) {
    delete options[id];
  } else {
    options[id] = value;
  }
  save();
  schedule();
}

function onHelper(kind: "selection" | "paste"): void {
  if (kind === "selection") {
    post({ type: "requestSelection" });
    return;
  }
  // The webview clipboard API is often blocked; the host's env.clipboard always works.
  const fallback = () => post({ type: "requestClipboard" });
  if (!navigator.clipboard?.readText) {
    fallback();
    return;
  }
  navigator.clipboard.readText().then(guard(fillFirst), fallback);
}

/** Puts `text` in the first field (no-op for generators). Returns whether it did. */
function setFirst(text: string): boolean {
  const first = tool?.fields[0];
  if (!first || !pane) {
    return false;
  }
  pane.setField(first.id, text);
  current().fields[first.id] = text;
  return true;
}

function fillFirst(text: string): void {
  if (setFirst(text)) {
    save();
    run();
  }
}

// --- keyboard -------------------------------------------------------------

function onSearchKey(e: KeyboardEvent): void {
  if (!rail) {
    return;
  }
  const list = rail.visible();
  const at = list.findIndex((t) => t.id === tool?.id);
  if (e.key === "ArrowDown" || e.key === "ArrowUp") {
    e.preventDefault();
    if (!list.length) {
      return;
    }
    const step = e.key === "ArrowDown" ? 1 : -1;
    const next = at < 0 ? (step > 0 ? 0 : list.length - 1) : (at + step + list.length) % list.length;
    select(list[next].id);
  } else if (e.key === "Enter") {
    e.preventDefault();
    const target = at >= 0 ? list[at] : list[0];
    if (target) {
      select(target.id, { focus: true });
    }
  } else if (e.key === "Escape" && rail.search.value) {
    e.preventDefault();
    rail.search.value = "";
    rail.filter("");
  }
}

document.addEventListener(
  "keydown",
  guard((e: KeyboardEvent) => {
    if (e.key === "/" && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e) && rail) {
      e.preventDefault();
      rail.search.focus();
    }
  }),
);

// --- messaging ------------------------------------------------------------

function post(msg: ToolboxFromWebview): void {
  vscode.postMessage(msg);
}

window.addEventListener(
  "message",
  guard((event: MessageEvent<ToolboxToWebview>) => {
    const msg = event.data;
    switch (msg.type) {
      case "init":
        tools = msg.tools;
        tool = undefined;
        pane = undefined;
        mount();
        // Saved state wins (same panel, just reloaded); init.selected is the globalState fallback.
        select(find(state.selected)?.id ?? msg.selected, { prefill: msg.prefill });
        break;
      case "focusTool":
        select(msg.id, { prefill: msg.prefill, focus: true });
        break;
      case "result":
        onResult(msg.requestId, msg.result);
        break;
      case "selection":
        fillFirst(msg.text);
        break;
    }
  }),
);

post({ type: "ready" });
