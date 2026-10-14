import * as vscode from "vscode";
import { JScratchFileSystemProvider } from "./etl/fileSystemProvider";
import { SessionManager } from "./etl/sessionManager";
import { PipelineTreeDataProvider } from "./etl/pipelineTree";
import { HistoryTreeDataProvider } from "./etl/historyTree";
import { Executor } from "./etl/executor";
import { TransformCodeLensProvider } from "./etl/codeLens";
import { registerPipelineCommands } from "./etl/commands";
import { log } from "./log";

export async function activate(context: vscode.ExtensionContext) {
  context.subscriptions.push(log);

  const fileSystemProvider = new JScratchFileSystemProvider(
    context.globalStorageUri,
  );
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("datalab", fileSystemProvider, {
      isCaseSensitive: true,
    }),
  );

  const sessionManager = new SessionManager(
    context.globalStorageUri,
    context.globalState,
  );

  const treeDataProvider = new PipelineTreeDataProvider(sessionManager);
  const pipelineTreeView = vscode.window.createTreeView(
    "jscratch.pipelineView",
    {
      treeDataProvider: treeDataProvider,
    },
  );

  const historyDataProvider = new HistoryTreeDataProvider(sessionManager);
  vscode.window.registerTreeDataProvider(
    "jscratch.historyView",
    historyDataProvider,
  );

  // Update view title when session changes
  sessionManager.onDidSessionChange(async () => {
    if (sessionManager.activeSessionId) {
      const metadata = await sessionManager.getMetadata(
        sessionManager.activeSessionId,
      );
      pipelineTreeView.title = `Active Session: ${metadata.name || "Untitled"}`;
      pipelineTreeView.message = undefined;
    } else {
      pipelineTreeView.title = "Active Session";
      pipelineTreeView.message = "No active session";
    }
  });

  const executor = new Executor(sessionManager, context.extensionUri);
  context.subscriptions.push(
    vscode.languages.registerCodeLensProvider(
      { scheme: "datalab", language: "typescript" },
      new TransformCodeLensProvider(),
    ),
  );

  registerPipelineCommands(context, { sessionManager, executor });

  // Commands are live before this runs, so a failed restore can't take them down.
  // Listeners are registered above; restore fires onDidSessionChange.
  try {
    await sessionManager.restore();
  } catch (e) {
    log.appendLine(`Failed to restore session: ${e}`);
  }
}

export function deactivate() {}
