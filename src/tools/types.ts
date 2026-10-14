export type Category = "encode" | "convert" | "generate" | "inspect";

export interface ToolField {
  id: string;
  label: string;
  multiline?: boolean;
  placeholder?: string;
}

export interface ToolOption {
  id: string;
  label: string;
  kind: "select" | "checkbox" | "number" | "text";
  choices?: string[];
  default: string | number | boolean;
}

export interface Tool {
  id: string; // "base64"
  title: string; // "Base64"
  category: Category;
  icon: string; // codicon name
  keywords?: string[]; // for search: ["b64", "atob"]
  fields: ToolField[]; // [] for pure generators
  options?: ToolOption[]; // e.g. mode: encode|decode, urlSafe
  outputLanguage?: string; // syntax hint for "open in editor"
  quickActions?: { label: string; options: Record<string, unknown> }[]; // editor submenu entries
  run(fields: Record<string, string>, options: Record<string, unknown>): ToolResult;
}

export type ToolResult =
  | { ok: true; output: string; meta?: string; data?: unknown } // meta: "3 matches"; data: structured payload, e.g. regex ranges
  | { ok: false; error: string };
