import * as vscode from "vscode";
import { SessionManager, PipelineNode } from "./sessionManager";
import { parse } from "./formats";
import { uniqueName } from "./names";

/** Skip row counting for files at or above this size. */
const COUNT_LIMIT_BYTES = 5 * 1024 * 1024;

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

  /** Row counts keyed by `uri@mtime`, so unchanged files aren't re-parsed on refresh. */
  private rowCounts = new Map<string, string | undefined>();

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
      return ms === undefined ? undefined : `${(ms / 1000).toFixed(1)}s`;
    }
    if (node.type !== "output") {
      return undefined;
    }
    try {
      const stat = await vscode.workspace.fs.stat(uri);
      if (stat.size >= COUNT_LIMIT_BYTES) {
        return undefined;
      }
      const key = `${uri.toString()}@${stat.mtime}`;
      if (!this.rowCounts.has(key)) {
        const raw = new TextDecoder().decode(
          await vscode.workspace.fs.readFile(uri),
        );
        const { data } = parse(node.filename, raw);
        this.rowCounts.set(
          key,
          Array.isArray(data)
            ? `${data.length.toLocaleString("en-US")} rows`
            : undefined,
        );
      }
      return this.rowCounts.get(key);
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
        const name = uniqueName(
          base === "pipeline.json" ? "pipeline-2.json" : base,
          existing,
        );
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
