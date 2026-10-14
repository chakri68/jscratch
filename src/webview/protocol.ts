import type { Tool } from "../tools/types";

/** Tool metadata sent to webviews; `run` stays in the extension host. */
export type ToolMeta = Omit<Tool, "run">;

// Task 13 fills these two.
export type ToolboxToWebview = never;
export type ToolboxFromWebview = never;
// Task 15 fills these two.
export type PreviewToWebview = never;
export type PreviewFromWebview = never;
