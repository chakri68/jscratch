import * as vscode from "vscode";
import { allTools, runTool } from "../tools/registry";

/** One command per tool quick action: jscratch.quick.<toolId>.<index> (declared in package.json). */
export function registerEditorActions(context: vscode.ExtensionContext): void {
  for (const tool of allTools()) {
    (tool.quickActions ?? []).forEach((action, index) => {
      context.subscriptions.push(
        vscode.commands.registerCommand(`jscratch.quick.${tool.id}.${index}`, async () => {
          const editor = vscode.window.activeTextEditor;
          if (!editor || editor.selection.isEmpty || !tool.fields.length) {
            return;
          }
          // Only the primary selection is supported.
          const selection = editor.selection;
          const result = runTool(
            tool.id,
            { [tool.fields[0].id]: editor.document.getText(selection) },
            action.options,
          );
          if (!result.ok) {
            vscode.window.showErrorMessage(result.error);
            return;
          }
          if (tool.id === "jwt") {
            const doc = await vscode.workspace.openTextDocument({
              language: "json",
              content: result.output,
            });
            await vscode.window.showTextDocument(doc, vscode.ViewColumn.Beside);
            return;
          }
          await editor.edit((b) => b.replace(selection, result.output));
        }),
      );
    });
  }
}
