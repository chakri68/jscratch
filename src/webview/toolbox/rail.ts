import "@vscode-elements/elements/dist/vscode-textfield/index.js";
import "@vscode-elements/elements/dist/vscode-single-select/index.js";
import "@vscode-elements/elements/dist/vscode-option/index.js";
import "@vscode-elements/elements/dist/vscode-icon/index.js";
import type { Category } from "../../tools/types";
import { toolMatches } from "../../tools/search";
import type { ToolMeta } from "../protocol";
import { h, icon } from "./dom";

const CATEGORIES: { id: Category; label: string; icon: string }[] = [
  { id: "encode", label: "Encode", icon: "symbol-key" },
  { id: "convert", label: "Convert", icon: "arrow-swap" },
  { id: "generate", label: "Generate", icon: "sparkle" },
  { id: "inspect", label: "Inspect", icon: "search" },
];

/**
 * Left rail (search + grouped tool list) plus its narrow-width stand-in, a
 * dropdown at the top. CSS decides which of the two is on screen.
 */
export class Rail {
  readonly el: HTMLElement;
  readonly narrowEl: HTMLElement;
  readonly search = h("vscode-textfield", {
    placeholder: "Search tools",
    "aria-label": "Search tools",
  });
  private readonly list = h("div", { id: "tb-list", class: "tb-list", role: "listbox", "aria-label": "Tools" });
  private readonly narrow = h("vscode-single-select", { combobox: true, "aria-label": "Tool" });
  private matches: ToolMeta[];
  private active: string | undefined;

  constructor(
    private readonly tools: ToolMeta[],
    private readonly pick: (id: string) => void,
  ) {
    this.matches = tools;
    this.search.append(h("span", { slot: "content-before", class: "tb-search-icon" }, [icon("search")]));
    this.search.append(h("kbd", { slot: "content-after", class: "tb-kbd muted", title: "Press / to search" }, ["/"]));
    this.el = h("nav", { class: "tb-rail", "aria-label": "Tools" }, [this.search, this.list]);

    for (const t of tools) {
      this.narrow.append(h("vscode-option", { value: t.id, description: categoryLabel(t.category) }, [t.title]));
    }
    this.narrow.addEventListener("change", () => {
      if (this.narrow.value && this.narrow.value !== this.active) {
        this.pick(this.narrow.value);
      }
    });
    this.narrowEl = h("div", { class: "tb-narrow" }, [this.narrow]);
    this.render("");
  }

  /** Tools passing the current search, in rail order. */
  visible(): ToolMeta[] {
    return this.matches;
  }

  filter(query: string): void {
    this.matches = this.tools.filter((t) => toolMatches(t, query));
    this.render(query);
  }

  setActive(id: string): void {
    this.active = id;
    this.list.querySelectorAll<HTMLElement>(".tb-item").forEach((row) => {
      const on = row.dataset.id === id;
      row.setAttribute("aria-selected", String(on));
      if (on) {
        row.scrollIntoView({ block: "nearest" });
      }
    });
    if (this.narrow.value !== id) {
      this.narrow.value = id;
    }
  }

  private render(query: string): void {
    const needle = query.trim().toLowerCase();
    const groups = CATEGORIES.map((c) => {
      const tools = this.matches.filter((t) => t.category === c.id);
      if (!tools.length) {
        return null;
      }
      return h("div", { class: "tb-group", role: "group", "aria-label": c.label }, [
        h("div", { class: "tb-cat" }, [icon(c.icon), h("span", {}, [c.label])]),
        ...tools.map((t) => this.row(t, needle)),
      ]);
    });
    this.list.replaceChildren(
      ...groups.filter((g): g is HTMLDivElement => g !== null),
      this.matches.length ? "" : h("div", { class: "tb-empty muted" }, ["No tools match."]),
    );
    if (this.active) {
      this.setActive(this.active);
    }
  }

  private row(t: ToolMeta, needle: string): HTMLElement {
    // When the hit came from a keyword, show which one, so "b64" → Base64 isn't a mystery.
    const hint =
      needle && !t.title.toLowerCase().includes(needle)
        ? (t.keywords ?? []).find((k) => k.toLowerCase().includes(needle))
        : undefined;
    const row = h(
      "button",
      { class: "tb-item", id: `tool-${t.id}`, role: "option", "aria-selected": "false", tabindex: -1, "data-id": t.id },
      [icon(t.icon), h("span", { class: "tb-item-title" }, [t.title]), hint ? h("span", { class: "tb-item-hint muted" }, [hint]) : null],
    );
    row.addEventListener("click", () => this.pick(t.id));
    return row;
  }
}

function categoryLabel(c: Category): string {
  return CATEGORIES.find((x) => x.id === c)?.label ?? c;
}
