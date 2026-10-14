import * as vscode from "vscode";
import { SessionManager } from "./sessionManager";
import { nodeStatus } from "./status";
import { sessionIdFromUri } from "./names";

const STALE_TIP = "Out of date — input or script changed since last run";

export class StatusDecorationProvider implements vscode.FileDecorationProvider {
  private _onDidChange = new vscode.EventEmitter<vscode.Uri | vscode.Uri[]>();
  readonly onDidChangeFileDecorations = this._onDidChange.event;

  constructor(private readonly sessionManager: SessionManager) {}

  refresh(uris: vscode.Uri[]): void {
    this._onDidChange.fire(uris);
  }

  /** Re-evaluate every node of a session (a parent edit makes its children stale). */
  async refreshSession(sessionId: string | undefined): Promise<void> {
    if (!sessionId) {
      return;
    }
    try {
      const metadata = await this.sessionManager.getMetadata(sessionId);
      const root = this.sessionManager.getSessionUri(sessionId);
      this.refresh(
        metadata.nodes.map((n) => vscode.Uri.joinPath(root, n.filename)),
      );
    } catch {
      // session vanished mid-refresh
    }
  }

  async provideFileDecoration(
    uri: vscode.Uri,
  ): Promise<vscode.FileDecoration | undefined> {
    if (uri.scheme !== "datalab") {
      return undefined;
    }
    const sessionId = sessionIdFromUri(uri);
    if (!sessionId) {
      return undefined;
    }
    try {
      const filename = uri.path.split("/").pop();
      const metadata = await this.sessionManager.getMetadata(sessionId);
      const node = metadata.nodes.find((n) => n.filename === filename);
      if (!node || node.type !== "transform" || !node.lastRun) {
        return undefined;
      }
      const parent = metadata.nodes.find((n) => n.id === node.parentId);
      const root = this.sessionManager.getSessionUri(sessionId);
      const mtime = async (name?: string) =>
        name
          ? (await vscode.workspace.fs.stat(vscode.Uri.joinPath(root, name)))
              .mtime
          : 0;
      const status = nodeStatus(
        node,
        await mtime(node.filename),
        await mtime(parent?.filename),
      );
      switch (status) {
        case "ok":
          return new vscode.FileDecoration(
            "✓",
            "Last run succeeded",
            new vscode.ThemeColor("testing.iconPassed"),
          );
        case "failed":
          return new vscode.FileDecoration(
            "!",
            node.lastRun.error ?? "Last run failed",
            new vscode.ThemeColor("testing.iconFailed"),
          );
        case "stale":
          return new vscode.FileDecoration(
            "•",
            STALE_TIP,
            new vscode.ThemeColor("editorWarning.foreground"),
          );
        default:
          return undefined;
      }
    } catch {
      return undefined;
    }
  }
}
