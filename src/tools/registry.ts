import type { Tool, ToolResult } from "./types";
import { base64 } from "./encode/base64";
import { url } from "./encode/url";
import { html } from "./encode/html";
import { hex } from "./encode/hex";
import { jwt } from "./encode/jwt";

// Order: encode -> convert -> generate -> inspect. Later tasks append here.
const TOOLS: Tool[] = [base64, url, html, hex, jwt];

const MAX_FIELD = 5 * 1024 * 1024;

export function allTools(): Tool[] {
  return TOOLS;
}

export function resolveTool(id: string | undefined): Tool {
  return TOOLS.find((t) => t.id === id) ?? TOOLS[0];
}

export function searchTools(q: string): Tool[] {
  const needle = q.trim().toLowerCase();
  if (!needle) {
    return [...TOOLS];
  }
  return TOOLS.filter((t) =>
    [t.title, t.id, ...(t.keywords ?? [])].some((s) => s.toLowerCase().includes(needle)),
  );
}

export function runTool(
  id: string,
  fields: Record<string, string>,
  options: Record<string, unknown> = {},
): ToolResult {
  const tool = TOOLS.find((t) => t.id === id);
  if (!tool) {
    return { ok: false, error: `Unknown tool: ${id}` };
  }
  for (const v of Object.values(fields)) {
    if (typeof v === "string" && v.length > MAX_FIELD) {
      return { ok: false, error: "Input too large (max 5 MB)" };
    }
  }
  const merged: Record<string, unknown> = {};
  for (const o of tool.options ?? []) {
    merged[o.id] = o.default;
  }
  Object.assign(merged, options);
  try {
    return tool.run(fields, merged);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

export function quickActions(): {
  tool: Tool;
  action: { label: string; options: Record<string, unknown> };
}[] {
  return TOOLS.flatMap((tool) => (tool.quickActions ?? []).map((action) => ({ tool, action })));
}
