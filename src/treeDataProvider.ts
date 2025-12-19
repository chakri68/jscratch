import * as vscode from "vscode";
import { SessionManager, PipelineNode } from "./sessionManager";

export class PipelineTreeDataProvider implements vscode.TreeDataProvider<PipelineNode> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    PipelineNode | undefined | null | void
  > = new vscode.EventEmitter<PipelineNode | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    PipelineNode | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private sessionManager: SessionManager) {
    this.sessionManager.onDidSessionChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: PipelineNode): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.label);

    treeItem.contextValue = element.type;

    if (element.type === "input") {
      treeItem.iconPath = new vscode.ThemeIcon("file");
    } else if (element.type === "transform") {
      treeItem.iconPath = new vscode.ThemeIcon("code");
    } else if (element.type === "output") {
      treeItem.iconPath = new vscode.ThemeIcon("output");
    }

    if (this.sessionManager.activeSessionId) {
      const uri = vscode.Uri.joinPath(
        this.sessionManager.getSessionUri(this.sessionManager.activeSessionId),
        element.filename,
      );
      treeItem.command = {
        command: "vscode.open",
        title: "Open File",
        arguments: [uri],
      };
    }

    return treeItem;
  }

  async getChildren(element?: PipelineNode): Promise<PipelineNode[]> {
    if (!this.sessionManager.activeSessionId) {
      return [];
    }

    const metadata = await this.sessionManager.getMetadata(
      this.sessionManager.activeSessionId,
    );

    if (!element) {
      // Return all nodes for now (flat list), or we can implement hierarchy later
      return metadata.nodes;
    }

    return [];
  }
}
