import type { ToolMeta } from "../protocol";

/**
 * What selecting a tool should do. A prefill only lands if the tool has a field
 * to put it in (generators don't); a fresh tool always runs, so its pane never
 * waits on, or shows, the previous tool's result.
 */
export function planSelect(
  tool: ToolMeta,
  prefill?: string,
  changed = true,
): { fill?: string; run: boolean } {
  const fill = prefill !== undefined && tool.fields.length > 0 ? prefill : undefined;
  return { fill, run: changed || prefill !== undefined };
}

/** Only the latest request renders; anything older was superseded. */
export function shouldRender(resultId: number, currentId: number): boolean {
  return resultId === currentId;
}
