import type { PipelineNode } from "./model";

export type NodeStatus = "never" | "ok" | "failed" | "stale";

/** Only transforms have a status. Stale (file touched after the run) wins over ok/failed. */
export function nodeStatus(
  node: PipelineNode,
  selfMtime: number,
  parentMtime: number,
): NodeStatus {
  if (node.type !== "transform" || !node.lastRun) {
    return "never";
  }
  if (node.lastRun.at < Math.max(selfMtime, parentMtime)) {
    return "stale";
  }
  return node.lastRun.ok ? "ok" : "failed";
}
