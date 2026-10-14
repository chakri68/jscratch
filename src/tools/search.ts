import type { Tool } from "./types";

/**
 * Case-insensitive substring match on title, id and keywords.
 * Import-free on purpose: the webview bundle uses it without dragging in the tools.
 */
export function toolMatches(
  tool: Pick<Tool, "id" | "title" | "keywords">,
  query: string,
): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) {
    return true;
  }
  return [tool.title, tool.id, ...(tool.keywords ?? [])].some((s) =>
    s.toLowerCase().includes(needle),
  );
}
