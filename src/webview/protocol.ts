import type { Tool, ToolResult } from "../tools/types";

/** Tool metadata sent to webviews; `run` stays in the extension host. */
export type ToolMeta = Omit<Tool, "run">;

/** Option values as the webview sends them. Never `undefined`: unset keys are omitted. */
export type OptionValues = Record<string, string | number | boolean>;

export type ToolboxToWebview =
  | { type: "init"; tools: ToolMeta[]; selected: string; prefill?: string }
  | { type: "focusTool"; id: string; prefill?: string }
  | { type: "result"; requestId: number; result: ToolResult }
  // Reply to requestSelection and requestClipboard alike: "put this in the first field".
  | { type: "selection"; text: string };

export type ToolboxFromWebview =
  // Sent once the script is listening; the host answers with init (also after a hidden panel reloads).
  | { type: "ready" }
  | {
      type: "run";
      requestId: number;
      toolId: string;
      fields: Record<string, string>;
      options: OptionValues;
    }
  // options ride along so Open in Editor can pick the language for the "from" direction.
  | {
      type: "copy" | "insert" | "openEditor" | "sendToPipeline";
      text: string;
      toolId: string;
      options?: OptionValues;
    }
  | { type: "openDiff"; left: string; right: string }
  | { type: "requestSelection" }
  | { type: "requestClipboard" }
  | { type: "selected"; toolId: string };
// Task 15 fills these two.
export type PreviewToWebview = never;
export type PreviewFromWebview = never;
