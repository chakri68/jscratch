import "@vscode-elements/elements/dist/vscode-textfield/index.js";
import "@vscode-elements/elements/dist/vscode-textarea/index.js";
import "@vscode-elements/elements/dist/vscode-single-select/index.js";
import "@vscode-elements/elements/dist/vscode-option/index.js";
import "@vscode-elements/elements/dist/vscode-checkbox/index.js";
import "@vscode-elements/elements/dist/vscode-button/index.js";
import "@vscode-elements/elements/dist/vscode-icon/index.js";
import type { ToolField, ToolOption } from "../../tools/types";
import type { OptionValues, ToolMeta } from "../protocol";
import { h, icon } from "../shared/dom";
import { OutputView, type OutputHandlers } from "./output";

export interface ToolValues {
  fields: Record<string, string>;
  options: OptionValues;
}

export interface PaneHandlers extends OutputHandlers {
  field(id: string, value: string): void;
  option(id: string, value: string | number | boolean | undefined): void;
  helper(kind: "selection" | "paste"): void;
  generate(): void;
}

export interface Pane {
  el: HTMLElement;
  output: OutputView;
  setField(id: string, value: string): void;
  focusFirst(): void;
}

/** Saved values for a tool, filled out with defaults (empty fields, option defaults). */
export function valuesFor(tool: ToolMeta, saved: ToolValues | undefined): ToolValues {
  const fields: Record<string, string> = {};
  for (const f of tool.fields) {
    fields[f.id] = saved?.fields?.[f.id] ?? "";
  }
  const options: OptionValues = {};
  for (const o of tool.options ?? []) {
    const v = saved?.options?.[o.id] ?? o.default;
    if (v !== undefined) {
      options[o.id] = v; // never store undefined: it would override the default host-side
    }
  }
  return { fields, options };
}

export function renderPane(tool: ToolMeta, values: ToolValues, handlers: PaneHandlers): Pane {
  const inputs = new Map<string, HTMLElement & { value: string }>();
  const fieldEls = tool.fields.map((f, i) => {
    const input = fieldInput(f, values.fields[f.id] ?? "");
    input.addEventListener("input", () => handlers.field(f.id, input.value));
    inputs.set(f.id, input);
    return h("div", { class: "tb-field" }, [
      h("div", { class: "tb-field-head" }, [
        h("label", { class: "tb-label", for: `f-${f.id}` }, [f.label]),
        i === 0 ? helpers(handlers) : null,
      ]),
      input,
    ]);
  });

  const optionEls = (tool.options ?? []).map((o) => optionInput(o, values.options[o.id], handlers));
  const isGenerator = tool.fields.length === 0;
  if (isGenerator) {
    const gen = h("vscode-button", { icon: "sparkle", class: "tb-generate" }, ["Generate"]);
    gen.addEventListener("click", () => handlers.generate());
    optionEls.push(gen);
  }

  const output = new OutputView(tool, handlers);
  const keywords = (tool.keywords ?? []).join(" · ");
  const el = h("main", { class: "tb-pane", "aria-label": tool.title }, [
    h("header", { class: "tb-title" }, [
      icon(tool.icon),
      h("h1", {}, [tool.title]),
      keywords ? h("span", { class: "tb-keywords muted" }, [keywords]) : null,
    ]),
    fieldEls.length ? h("div", { class: "tb-fields" }, fieldEls) : null,
    optionEls.length ? h("div", { class: "tb-options" }, optionEls) : null,
    output.el,
  ]);

  return {
    el,
    output,
    setField(id, value) {
      const input = inputs.get(id);
      if (input) {
        input.value = value;
      }
    },
    focusFirst() {
      const first = inputs.values().next().value ?? el.querySelector<HTMLElement>(".tb-generate");
      first?.focus();
    },
  };
}

function fieldInput(f: ToolField, value: string): HTMLElement & { value: string } {
  const attrs = { id: `f-${f.id}`, placeholder: f.placeholder, "aria-label": f.label };
  const input = f.multiline
    ? h("vscode-textarea", { ...attrs, rows: 8, resize: "vertical", monospace: true, spellcheck: false })
    : h("vscode-textfield", attrs);
  input.value = value;
  return input;
}

function helpers(handlers: PaneHandlers): HTMLElement {
  const btn = (name: string, label: string, kind: "selection" | "paste") => {
    const b = h("vscode-button", { icon: name, "icon-only": true, secondary: true, title: label, "aria-label": label });
    b.addEventListener("click", () => handlers.helper(kind));
    return b;
  };
  return h("span", { class: "tb-helpers" }, [
    btn("selection", "Use editor selection", "selection"),
    btn("clippy", "Paste from clipboard", "paste"),
  ]);
}

function optionInput(
  o: ToolOption,
  value: string | number | boolean | undefined,
  handlers: PaneHandlers,
): HTMLElement {
  const id = `o-${o.id}`;
  switch (o.kind) {
    case "checkbox": {
      const box = h("vscode-checkbox", { id, label: o.label, checked: Boolean(value) });
      box.addEventListener("change", () => handlers.option(o.id, box.checked));
      return h("div", { class: "tb-option tb-option-check" }, [box]);
    }
    case "select": {
      const select = h(
        "vscode-single-select",
        { id, "aria-label": o.label },
        (o.choices ?? []).map((c) => h("vscode-option", { value: c, selected: c === String(value) }, [c])),
      );
      select.addEventListener("change", () => handlers.option(o.id, select.value));
      return labelled(o, id, select);
    }
    case "number": {
      const field = h("vscode-textfield", { id, type: "number", class: "tb-number", "aria-label": o.label });
      field.value = value === undefined ? "" : String(value);
      field.addEventListener("input", () => {
        // Empty or junk means "not set": omit it so the tool's default applies.
        const n = field.value.trim() === "" ? NaN : Number(field.value);
        handlers.option(o.id, Number.isFinite(n) ? n : undefined);
      });
      return labelled(o, id, field);
    }
    case "text": {
      const field = h("vscode-textfield", { id, "aria-label": o.label });
      field.value = value === undefined ? "" : String(value);
      field.addEventListener("input", () => handlers.option(o.id, field.value));
      return labelled(o, id, field);
    }
  }
}

function labelled(o: ToolOption, id: string, control: HTMLElement): HTMLElement {
  return h("div", { class: "tb-option" }, [h("label", { class: "tb-label", for: id }, [o.label]), control]);
}
