type Attrs = Record<string, string | number | boolean | undefined>;
type Child = Node | string | null | undefined | false;

/**
 * Tiny element builder. Attributes only (true = present, false/undefined = absent);
 * set properties such as `.value` on the result.
 */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs = {},
  children: Child[] = [],
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === true) {
      el.setAttribute(k, "");
    } else if (v !== false && v !== undefined) {
      el.setAttribute(k, String(v));
    }
  }
  for (const c of children) {
    if (c) {
      el.append(c);
    }
  }
  return el;
}

export function icon(name: string, label?: string): HTMLElement {
  return h("vscode-icon", { name, label, "aria-hidden": label ? undefined : "true" });
}

/** True when keystrokes are going into something editable. */
export function isTyping(e: Event): boolean {
  return e.composedPath().some((n) => {
    if (!(n instanceof HTMLElement)) {
      return false;
    }
    const tag = n.tagName.toLowerCase();
    return (
      n.isContentEditable ||
      tag === "input" ||
      tag === "textarea" ||
      tag === "vscode-textfield" ||
      tag === "vscode-textarea"
    );
  });
}
