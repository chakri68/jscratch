import * as vscode from "vscode";
import { SessionManager, PipelineNode } from "./sessionManager";
import { parse } from "./formats";
import { safeInputName } from "./names";
import { addInputFile } from "./inputs";

/** Skip row counting for files at or above this size. */
const COUNT_LIMIT_BYTES = 5 * 1024 * 1024;

export class PipelineTreeDataProvider
  implements
    vscode.TreeDataProvider<PipelineNode>,
    vscode.TreeDragAndDropController<PipelineNode>
{
  readonly dropMimeTypes = ["text/uri-list"];
  readonly dragMimeTypes: string[] = [];

  private _onDidChangeTreeData = new vscode.EventEmitter<
    PipelineNode | undefined | null | void
  >();
  readonly onDidChangeTreeData = this._onDidChangeTreeData.event;

  /** Row counts keyed by uri, invalidated by mtime, so unchanged files aren't re-parsed on refresh. */
  private rowCounts = new Map<
    string,
    { mtime: number; count: string | undefined }
  >();

  constructor(
    private sessionManager: SessionManager,
    private extensionUri: vscode.Uri,
  ) {
    this.sessionManager.onDidSessionChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  async getTreeItem(element: PipelineNode): Promise<vscode.TreeItem> {
    const sessionId = this.sessionManager.activeSessionId;
    const hasChildren = sessionId
      ? (await this.sessionManager.children(sessionId, element.id)).length > 0
      : false;
    const item = new vscode.TreeItem(
      element.label,
      hasChildren
        ? vscode.TreeItemCollapsibleState.Expanded
        : vscode.TreeItemCollapsibleState.None,
    );
    item.id = element.id;
    item.contextValue = element.type;
    const icon = (suffix: string) =>
      vscode.Uri.joinPath(
        this.extensionUri,
        "media",
        "nodes",
        `${element.type}${suffix}.svg`,
      );
    item.iconPath = { light: icon(""), dark: icon("-dark") };

    if (sessionId) {
      const uri = vscode.Uri.joinPath(
        this.sessionManager.getSessionUri(sessionId),
        element.filename,
      );
      item.resourceUri = uri;
      item.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [uri],
      };
      item.description = await this.describe(element, uri);
    }
    return item;
  }

  private async describe(
    node: PipelineNode,
    uri: vscode.Uri,
  ): Promise<string | undefined> {
    if (node.type === "transform") {
      const ms = node.lastRun?.durationMs;
      if (ms === undefined) {
        return undefined;
      }
      return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
    }
    if (node.type !== "output") {
      return undefined;
    }
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size >= COUNT_LIMIT_BYTES) {
        return undefined;
      }
      const key = uri.toString();
      const hit = this.rowCounts.get(key);
      if (hit && hit.mtime === stat.mtime) {
        return hit.count;
      }
      const raw = new TextDecoder().decode(
        await vscode.workspace.fs.readFile(uri),
      );
      const { data } = parse(node.filename, raw);
      const count = Array.isArray(data)
        ? `${data.length.toLocaleString()} ${data.length === 1 ? "row" : "rows"}`
        : undefined;
      this.rowCounts.set(key, { mtime: stat.mtime, count });
      return count;
    } catch {
      return undefined;
    }
  }

  async getChildren(element?: PipelineNode): Promise<PipelineNode[]> {
    const sessionId = this.sessionManager.activeSessionId;
    if (!sessionId) {
      return [];
    }
    const metadata = await this.sessionManager.getMetadata(sessionId);
    return metadata.nodes.filter((n) => n.parentId === element?.id);
  }

  async handleDrop(
    _target: PipelineNode | undefined,
    dataTransfer: vscode.DataTransfer,
  ): Promise<void> {
    const sessionId = this.sessionManager.activeSessionId;
    const item = dataTransfer.get("text/uri-list");
    if (!sessionId || !item) {
      return;
    }
    const list = await item.asString();
    const uris = list
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#"))
      .map((l) => vscode.Uri.parse(l))
      .filter((u) => u.scheme === "file");
    const all = list
      .split(/\r?\n/)
      .filter((l) => l.trim() && !l.startsWith("#"));
    const skipped = all.length - uris.length;
    if (skipped > 0) {
      vscode.window.showInformationMessage(
        `Skipped ${skipped} item(s) that aren't local files`,
      );
    }
    for (const uri of uris) {
      try {
        const stat = await vscode.workspace.fs.stat(uri);
        if (stat.type !== vscode.FileType.File) {
          continue;
        }
        const existing = (
          await this.sessionManager.getMetadata(sessionId)
        ).nodes.map((n) => n.filename);
        const base = uri.path.split("/").pop() || "input.txt";
        const name = safeInputName(base, existing);
        await addInputFile(
          this.sessionManager,
          sessionId,
          name,
          await vscode.workspace.fs.readFile(uri),
        );
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to add ${uri.fsPath}: ${error}`);
      }
    }
  }
}
