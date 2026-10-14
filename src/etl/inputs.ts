import * as vscode from "vscode";
import type { SessionManager, PipelineNode } from "./sessionManager";

/** Copy bytes into the session as a new input node. Returns the node. */
export async function addInputFile(
  sessionManager: SessionManager,
  sessionId: string,
  filename: string,
  content: Uint8Array,
): Promise<PipelineNode> {
  const sessionUri = sessionManager.getSessionUri(sessionId);
  await vscode.workspace.fs.writeFile(
    vscode.Uri.joinPath(sessionUri, filename),
    content,
  );
  const node: PipelineNode = {
    id: `${Date.now()}${Math.floor(Math.random() * 1000)}`,
    type: "input",
    label: filename,
    filename,
  };
  await sessionManager.addNode(sessionId, node);
  return node;
}
