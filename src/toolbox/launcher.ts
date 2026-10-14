import * as vscode from "vscode";
import { allTools } from "../tools/registry";
import { CATEGORIES } from "./categories";
import { ToolboxPanel } from "./toolboxPanel";

interface ToolItem extends vscode.QuickPickItem {
  toolId?: string;
}

/** jscratch.openTool: with an id, opens that tool; without, asks via quick pick. */
export function registerLauncher(context: vscode.ExtensionContext): void {
  context.subscriptions.push(
    vscode.commands.registerCommand("jscratch.openTool", async (toolId?: unknown) => {
      let id = typeof toolId === "string" ? toolId : undefined;
      if (!id) {
        const picked = await vscode.window.showQuickPick(items(), {
          placeHolder: "Open a tool",
          matchOnDescription: true,
        });
        id = picked?.toolId;
      }
      if (!id) {
        return;
      }
      const editor = vscode.window.activeTextEditor;
      const text = editor ? editor.document.getText(editor.selection) : "";
      ToolboxPanel.show(context, id, text || undefined);
    }),
  );
}

function items(): ToolItem[] {
  const out: ToolItem[] = [];
  for (const cat of CATEGORIES) {
    out.push({ label: cat.label, kind: vscode.QuickPickItemKind.Separator });
    for (const t of allTools().filter((t) => t.category === cat.id)) {
      out.push({
        label: `$(${t.icon}) ${t.title}`,
        description: (t.keywords ?? []).join(", "),
        toolId: t.id,
      });
    }
  }
  return out;
}
