import * as vscode from "vscode";
import * as path from "path";
import { JScratchFileSystemProvider } from "./fileSystemProvider";
import {
  SessionManager,
  PipelineNode,
  SessionMetadata,
} from "./sessionManager";
import { PipelineTreeDataProvider } from "./treeDataProvider";
import { HistoryTreeDataProvider } from "./historyDataProvider";
import { Executor } from "./executor";
import { TransformCodeLensProvider } from "./codeLensProvider";

function inferType(value: any, indent = ""): string {
  if (value === null) {
    return "any";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "any[]";
    }
    return `${inferType(value[0], indent)}[]`;
  }
  if (typeof value === "object") {
    const keys = Object.keys(value);
    if (keys.length === 0) {
      return "{}";
    }
    const props = keys
      .map((key) => {
        const keyStr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
          ? key
          : `"${key}"`;
        return `${indent}    ${keyStr}: ${inferType(
          value[key],
          indent + "    ",
        )};`;
      })
      .join("\n");
    return `{\n${props}\n${indent}}`;
  }
  return typeof value;
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Congratulations, your extension "jscratch" is now active!');

  const fileSystemProvider = new JScratchFileSystemProvider(
    context.globalStorageUri,
  );
  context.subscriptions.push(
    vscode.workspace.registerFileSystemProvider("datalab", fileSystemProvider, {
      isCaseSensitive: true,
    }),
  );

  const sessionManager = new SessionManager(context.globalStorageUri);

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

  let newSessionCommand = vscode.commands.registerCommand(
    "jscratch.newSession",
    async () => {
      const name = await vscode.window.showInputBox({
        prompt: "Enter session name",
        placeHolder: "My Data Analysis",
      });

      if (name === undefined) {
        return;
      } // Cancelled

      try {
        await sessionManager.createSession(name || undefined);
        vscode.commands.executeCommand("jscratch.pipelineView.focus");
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create session: ${error}`);
      }
    },
  );

  let loadSessionCommand = vscode.commands.registerCommand(
    "jscratch.loadSession",
    async (session: SessionMetadata) => {
      if (session) {
        sessionManager.setSession(session.id);
      }
    },
  );

  let deleteSessionCommand = vscode.commands.registerCommand(
    "jscratch.deleteSession",
    async (session: SessionMetadata) => {
      if (session) {
        const answer = await vscode.window.showWarningMessage(
          `Are you sure you want to delete session '${session.name}'?`,
          "Yes",
          "No",
        );
        if (answer === "Yes") {
          await sessionManager.deleteSession(session.id);
        }
      }
    },
  );

  let createInputCommand = vscode.commands.registerCommand(
    "jscratch.createInput",
    async () => {
      if (!sessionManager.activeSessionId) {
        vscode.window.showErrorMessage(
          "No active session. Please create a session first.",
        );
        return;
      }

      const fileName = await vscode.window.showInputBox({
        prompt: "Enter file name (e.g., data.json)",
        placeHolder: "data.json",
      });

      if (!fileName) {
        return;
      }

      try {
        const sessionUri = sessionManager.getSessionUri(
          sessionManager.activeSessionId,
        );
        const fileUri = vscode.Uri.joinPath(sessionUri, fileName);

        // Create empty file
        await vscode.workspace.fs.writeFile(fileUri, new Uint8Array());

        // Update metadata
        await sessionManager.addNode(sessionManager.activeSessionId, {
          id: Date.now().toString(),
          type: "input",
          label: fileName,
          filename: fileName,
        });

        // Open file
        const doc = await vscode.workspace.openTextDocument(fileUri);
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create input file: ${error}`);
      }
    },
  );

  let addTransformCommand = vscode.commands.registerCommand(
    "jscratch.addTransform",
    async (node: PipelineNode) => {
      if (!sessionManager.activeSessionId || !node) {
        return;
      }

      try {
        const sessionUri = sessionManager.getSessionUri(
          sessionManager.activeSessionId,
        );

        // Infer type from parent file
        const parentUri = vscode.Uri.joinPath(sessionUri, node.filename);
        let typeDefinition = "any";

        try {
          const parentContentBytes =
            await vscode.workspace.fs.readFile(parentUri);
          const parentContent = new TextDecoder().decode(parentContentBytes);
          const ext = path.extname(node.filename).toLowerCase();

          if (ext === ".json") {
            try {
              const obj = JSON.parse(parentContent);
              typeDefinition = inferType(obj, "    ");
            } catch {
              // Invalid JSON, fallback to any
            }
          } else if (ext === ".csv") {
            typeDefinition = "string[][]";
          } else if (ext === ".txt") {
            typeDefinition = "string[]";
          }
        } catch (e) {
          console.error("Failed to infer type:", e);
        }

        const timestamp = Date.now();
        const transformFilename = `transform-${timestamp}.ts`;
        const transformUri = vscode.Uri.joinPath(sessionUri, transformFilename);

        const defaultScript = `
import * as path from 'path';

// Type definitions for the injected global 'input'
interface InputData {
    raw: string;
    data: ${typeDefinition};
}

// Declare the global 'input' variable so TypeScript knows about it
declare const input: InputData;

/**
 * Transformation Script
 */
export function transform(): any {
    // TODO: Implement your transformation logic
    // Example: return input.data.map((item: any) => item.id);
    
    if (typeof input !== 'undefined' && input.data) {
        return input.data;
    }
    return {};
}
`;
        await vscode.workspace.fs.writeFile(
          transformUri,
          new TextEncoder().encode(defaultScript),
        );

        await sessionManager.addNode(sessionManager.activeSessionId, {
          id: timestamp.toString(),
          type: "transform",
          label: transformFilename,
          filename: transformFilename,
          parentId: node.id,
        });

        const doc = await vscode.workspace.openTextDocument(transformUri);
        await vscode.window.showTextDocument(doc);
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to create transform: ${error}`);
      }
    },
  );

  let runTransformCommand = vscode.commands.registerCommand(
    "jscratch.runTransform",
    async (nodeOrUri: PipelineNode | vscode.Uri) => {
      await executor.runTransform(nodeOrUri);
    },
  );

  let exportFileCommand = vscode.commands.registerCommand(
    "jscratch.exportFile",
    async (node: PipelineNode) => {
      if (!sessionManager.activeSessionId || !node) {
        return;
      }

      try {
        const sessionUri = sessionManager.getSessionUri(
          sessionManager.activeSessionId,
        );
        const fileUri = vscode.Uri.joinPath(sessionUri, node.filename);

        // Read content
        const content = await vscode.workspace.fs.readFile(fileUri);

        // Show save dialog
        const saveUri = await vscode.window.showSaveDialog({
          defaultUri: vscode.Uri.file(node.filename),
          saveLabel: "Export",
        });

        if (saveUri) {
          await vscode.workspace.fs.writeFile(saveUri, content);
          vscode.window.showInformationMessage(
            `Successfully exported ${node.filename}`,
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to export file: ${error}`);
      }
    },
  );

  let clearHistoryCommand = vscode.commands.registerCommand(
    "jscratch.clearHistory",
    async () => {
      const answer = await vscode.window.showWarningMessage(
        "Are you sure you want to clear all session history?",
        "Yes",
        "No",
      );
      if (answer === "Yes") {
        await sessionManager.clearHistory();
      }
    },
  );

  context.subscriptions.push(
    newSessionCommand,
    loadSessionCommand,
    deleteSessionCommand,
    createInputCommand,
    addTransformCommand,
    runTransformCommand,
    exportFileCommand,
    clearHistoryCommand,
  );
}

export function deactivate() {}
