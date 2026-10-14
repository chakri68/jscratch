import "@vscode-elements/elements/dist/vscode-button/index.js";
import "@vscode-elements/elements/dist/vscode-icon/index.js";
import type { ToolResult } from "../../tools/types";
import type { ToolMeta } from "../protocol";
import { h, icon } from "../shared/dom";

export type OutputAction = "copy" | "insert" | "openEditor" | "sendToPipeline";

export interface OutputHandlers {
  action(kind: OutputAction, text: string): void;
  openDiff(): void;
}

const HINT = "Output appears here as you type.";

interface ActionDef {
  kind: OutputAction;
  label: string;
  icon: string;
  done?: string;
}

const ACTIONS: ActionDef[] = [
  { kind: "copy", label: "Copy", icon: "copy", done: "Copied" },
  { kind: "insert", label: "Insert", icon: "insert" },
  { kind: "openEditor", label: "Open in Editor", icon: "go-to-file" },
  { kind: "sendToPipeline", label: "Send to Pipeline", icon: "type-hierarchy-sub" },
];

/** Output block of the tool pane: result, meta line, error box and actions. */
export class OutputView {
  readonly el: HTMLElement;
  private readonly body: HTMLElement;
  private readonly meta: HTMLElement;
  private readonly error: HTMLElement;
  private readonly buttons: HTMLElement[] = [];
  private text: string | undefined;

  constructor(
    private readonly tool: ToolMeta,
    private readonly handlers: OutputHandlers,
  ) {
    this.body = h("div", { class: "tb-output-body" });
    this.meta = h("span", { class: "tb-meta muted", "aria-live": "polite" });
    this.error = h("div", { class: "tb-error", role: "alert", hidden: true });
    const isDiff = tool.id === "diff";
    const actions = h("div", { class: "tb-actions", hidden: isDiff });
    for (const a of ACTIONS) {
      const btn = h("vscode-button", { icon: a.icon, secondary: a.kind !== "copy", disabled: true }, [
        a.label,
      ]);
      btn.addEventListener("click", () => {
        if (this.text === undefined || btn.hasAttribute("disabled")) {
          return;
        }
        handlers.action(a.kind, this.text);
        flash(btn, a);
      });
      this.buttons.push(btn);
      actions.append(btn);
    }
    this.el = h("section", { class: "tb-output", "aria-label": "Output" }, [
      h("div", { class: "tb-section-head" }, [h("span", { class: "tb-label" }, ["Output"]), this.meta]),
      this.body,
      this.error,
      actions,
    ]);
    this.showHint();
  }

  /** Nothing to show yet: muted hint, no error, actions off. */
  showHint(): void {
    this.setText(undefined);
    this.meta.textContent = "";
    this.hideError();
    if (this.tool.id === "diff") {
      this.renderDiff(false);
    } else {
      this.body.replaceChildren(h("div", { class: "tb-hint muted" }, [HINT]));
    }
  }

  /** `fields` are the values the result was computed from (regex needs the text). */
  show(result: ToolResult, fields: Record<string, string>): void {
    if (!result.ok) {
      this.showError(result.error);
      return;
    }
    this.hideError();
    this.meta.textContent = result.meta ?? "";
    if (this.tool.id === "diff") {
      this.renderDiff(true);
      return;
    }
    this.setText(result.output);
    if (result.output === "") {
      this.body.replaceChildren(h("div", { class: "tb-hint muted" }, [HINT]));
      return;
    }
    const pre = h("pre", { class: "tb-pre", tabindex: 0 }, [result.output]);
    const ranges = regexRanges(this.tool, result.data);
    if (ranges && fields.text) {
      this.body.replaceChildren(
        h("div", { class: "tb-sublabel muted" }, ["Matches in text"]),
        highlight(fields.text, ranges),
        h("div", { class: "tb-sublabel muted" }, ["Match list"]),
        pre,
      );
    } else {
      this.body.replaceChildren(pre);
    }
  }

  /** Error box under the output; the last good output stays, dimmed, so typing mid-edit doesn't flicker. */
  showError(message: string): void {
    this.error.replaceChildren(icon("error"), h("span", {}, [message]));
    this.error.hidden = false;
    this.body.classList.add("stale");
    this.meta.textContent = "";
    this.setText(undefined);
  }

  private hideError(): void {
    this.error.hidden = true;
    this.body.classList.remove("stale");
  }

  private renderDiff(ready: boolean): void {
    const btn = h("vscode-button", { icon: "diff", disabled: !ready }, ["Open Diff"]);
    btn.addEventListener("click", () => {
      if (!btn.hasAttribute("disabled")) {
        this.handlers.openDiff();
      }
    });
    this.body.replaceChildren(
      h("div", { class: "tb-diff" }, [
        btn,
        h("span", { class: "muted" }, ["Opens both sides in VS Code's diff editor."]),
      ]),
    );
  }

  private setText(text: string | undefined): void {
    this.text = text;
    const off = text === undefined || text === "";
    for (const b of this.buttons) {
      b.toggleAttribute("disabled", off);
    }
  }
}

function regexRanges(tool: ToolMeta, data: unknown): [number, number][] | undefined {
  if (tool.id !== "regex" || typeof data !== "object" || data === null) {
    return undefined;
  }
  const ranges = (data as { ranges?: unknown }).ranges;
  return Array.isArray(ranges) ? (ranges as [number, number][]) : undefined;
}

/** `text` with each [start, end) range wrapped in <mark>; empty matches get a caret. */
function highlight(text: string, ranges: [number, number][]): HTMLElement {
  const pre = h("pre", { class: "tb-pre tb-highlight", tabindex: 0 });
  let at = 0;
  for (const [start, end] of ranges) {
    if (start < at) {
      continue; // defensive: ranges come sorted and disjoint
    }
    pre.append(text.slice(at, start));
    pre.append(h("mark", { class: start === end ? "empty" : undefined }, [text.slice(start, end)]));
    at = end;
  }
  pre.append(text.slice(at));
  return pre;
}

/** Brief "Copied ✓" on the button; only for actions with no visible effect of their own. */
function flash(btn: HTMLElement, a: ActionDef): void {
  if (!a.done) {
    return;
  }
  btn.textContent = a.done;
  btn.setAttribute("icon", "check");
  setTimeout(() => {
    btn.textContent = a.label;
    btn.setAttribute("icon", a.icon);
  }, 1200);
}
