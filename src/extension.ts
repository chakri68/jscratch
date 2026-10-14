import * as vscode from "vscode";
import { JScratchFileSystemProvider } from "./etl/fileSystemProvider";
import { SessionManager } from "./etl/sessionManager";
import { PipelineTreeDataProvider } from "./etl/pipelineTree";
import { HistoryTreeDataProvider } from "./etl/historyTree";
import { Executor } from "./etl/executor";
import { TransformCodeLensProvider } from "./etl/codeLens";
import { registerPipelineCommands } from "./etl/commands";
import { StatusDecorationProvider } from "./etl/statusDecorations";
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

  const treeDataProvider = new PipelineTreeDataProvider(
    sessionManager,
    context.extensionUri,
  );
  const pipelineTreeView = vscode.window.createTreeView(
    "jscratch.pipelineView",
    {
      treeDataProvider: treeDataProvider,
      dragAndDropController: treeDataProvider,
    },
  );

  const historyDataProvider = new HistoryTreeDataProvider(sessionManager);
  vscode.window.registerTreeDataProvider(
    "jscratch.historyView",
    historyDataProvider,
  );

  const decorations = new StatusDecorationProvider(sessionManager);
  context.subscriptions.push(
    vscode.window.registerFileDecorationProvider(decorations),
    fileSystemProvider.onDidChangeFile(() =>
      decorations.refreshSession(sessionManager.activeSessionId),
    ),
  );

  // View title, welcome-view context keys and badges follow the active session
  let changeSeq = 0;
  sessionManager.onDidSessionChange(async () => {
    const seq = ++changeSeq;
    const sessionId = sessionManager.activeSessionId;
    let title = "Active Session";
    let empty = false;
    if (sessionId) {
      try {
        const metadata = await sessionManager.getMetadata(sessionId);
        title = metadata.name || "Untitled";
        empty = metadata.nodes.length === 0;
      } catch (e) {
        log.appendLine(`Failed to read session metadata: ${e}`);
      }
    }
    if (seq !== changeSeq) {
      return; // a newer change superseded this one
    }
    pipelineTreeView.title = title;
    await vscode.commands.executeCommand(
      "setContext",
      "jscratch.hasSession",
      !!sessionId,
    );
    await vscode.commands.executeCommand(
      "setContext",
      "jscratch.sessionEmpty",
      empty,
    );
    await decorations.refreshSession(sessionId);
  });

  const executor = new Executor(sessionManager);
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
