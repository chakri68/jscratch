import type { DataFormat } from "./formats";

export interface PipelineNode {
  id: string;
  type: "input" | "transform" | "output";
  label: string;
  filename: string;
  parentId?: string;
  outputFormat?: DataFormat;
  lastRun?: {
    at: number;
    ok: boolean;
    durationMs: number;
    error?: string;
  };
}

export interface SessionMetadata {
  id: string;
  created: string;
  name?: string;
  nodes: PipelineNode[];
}
