import * as vscode from "vscode";
import { allTools } from "../tools/registry";
import type { Category, Tool } from "../tools/types";
import { CATEGORIES } from "./categories";

type Node = { kind: "category"; id: Category } | { kind: "tool"; tool: Tool };

export class ToolboxTreeDataProvider implements vscode.TreeDataProvider<Node> {
  getTreeItem(node: Node): vscode.TreeItem {
    if (node.kind === "category") {
      const cat = CATEGORIES.find((c) => c.id === node.id);
      const item = new vscode.TreeItem(cat?.label ?? node.id, vscode.TreeItemCollapsibleState.Expanded);
      item.iconPath = new vscode.ThemeIcon(cat?.icon ?? "folder");
      item.id = `category:${node.id}`;
      return item;
    }
    const { tool } = node;
    const item = new vscode.TreeItem(tool.title, vscode.TreeItemCollapsibleState.None);
    item.id = `tool:${tool.id}`;
    item.iconPath = new vscode.ThemeIcon(tool.icon);
    item.command = {
      command: "jscratch.openTool",
      title: "Open Tool",
      arguments: [tool.id],
    };
    return item;
  }

  getChildren(node?: Node): Node[] {
    if (!node) {
      return CATEGORIES.map((c) => ({ kind: "category", id: c.id }));
    }
    if (node.kind === "category") {
      return allTools()
        .filter((t) => t.category === node.id)
        .map((tool) => ({ kind: "tool", tool }));
    }
    return [];
  }
}
