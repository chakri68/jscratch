import * as vscode from "vscode";
import type { SessionManager } from "./sessionManager";
import { sessionIdFromUri } from "./names";

export class TransformCodeLensProvider implements vscode.CodeLensProvider {
  constructor(private readonly sessionManager: SessionManager) {}

  async provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): Promise<vscode.CodeLens[]> {
    if (
      document.uri.scheme !== "datalab" ||
      !document.uri.path.endsWith(".ts")
    ) {
      return [];
    }

    const text = document.getText();
    const match = /export\s+function\s+transform/.exec(text);
    if (!match) {
      return [];
    }
    const line = document.positionAt(match.index).line;
    const range = new vscode.Range(line, 0, line, 0);
    const lenses = [
      new vscode.CodeLens(range, {
        title: "▶ Run Transformation",
        command: "jscratch.runTransform",
        arguments: [document.uri],
      }),
    ];
    const input = await this.parentUri(document.uri);
    if (input && !token.isCancellationRequested) {
      lenses.push(
        new vscode.CodeLens(range, {
          title: "$(table) Preview Input",
          command: "jscratch.preview",
          arguments: [input],
        }),
      );
    }
    return lenses;
  }

  /** The file this transform reads from, per the session's pipeline.json. */
  private async parentUri(uri: vscode.Uri): Promise<vscode.Uri | undefined> {
    const sessionId = sessionIdFromUri(uri);
    if (!sessionId) {
      return undefined;
    }
    try {
      const { nodes } = await this.sessionManager.getMetadata(sessionId);
      const filename = uri.path.split("/").pop();
      const node = nodes.find((n) => n.filename === filename);
      const parent = nodes.find((n) => n.id === node?.parentId);
      return parent
        ? vscode.Uri.joinPath(this.sessionManager.getSessionUri(sessionId), parent.filename)
        : undefined;
    } catch {
      return undefined; // no metadata: just skip the lens
    }
  }
}
