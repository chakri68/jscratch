import * as vscode from "vscode";
import { SessionManager, SessionMetadata } from "./sessionManager";

export class HistoryTreeDataProvider implements vscode.TreeDataProvider<SessionMetadata> {
  private _onDidChangeTreeData: vscode.EventEmitter<
    SessionMetadata | undefined | null | void
  > = new vscode.EventEmitter<SessionMetadata | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<
    SessionMetadata | undefined | null | void
  > = this._onDidChangeTreeData.event;

  constructor(private sessionManager: SessionManager) {
    this.sessionManager.onDidSessionChange(() => this.refresh());
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: SessionMetadata): vscode.TreeItem {
    const treeItem = new vscode.TreeItem(element.name || element.id);
    treeItem.description = new Date(element.created).toLocaleString();
    treeItem.contextValue = "session";
    treeItem.iconPath = new vscode.ThemeIcon("history");

    if (element.id === this.sessionManager.activeSessionId) {
      treeItem.iconPath = new vscode.ThemeIcon("check");
      treeItem.description += " (Active)";
    }

    treeItem.command = {
      command: "jscratch.loadSession",
      title: "Load Session",
      arguments: [element],
    };

    return treeItem;
  }

  async getChildren(element?: SessionMetadata): Promise<SessionMetadata[]> {
    if (!element) {
      return this.sessionManager.getSessions();
    }
    return [];
  }
}
