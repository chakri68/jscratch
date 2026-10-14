import * as vscode from "vscode";
import {
  SessionManager,
  PipelineNode,
  SessionMetadata,
} from "./sessionManager";
import { Executor } from "./executor";
import { typeDefForFile } from "./typeInference";
import { transformTemplate, replaceTypeDefs } from "./templates";
import { nextTransformName, validateFileName } from "./names";
import type { DataFormat } from "./formats";
import { log } from "../log";

export interface PipelineDeps {
  sessionManager: SessionManager;
  executor: Executor;
}

function defaultFormat(): DataFormat {
  return vscode.workspace
    .getConfiguration("jscratch.pipeline")
    .get<DataFormat>("defaultOutputFormat", "json");
}

export function registerPipelineCommands(
  context: vscode.ExtensionContext,
  deps: PipelineDeps,
) {
  const { sessionManager, executor } = deps;

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
      const sessionId = sessionManager.activeSessionId;

      try {
        const metadata = await sessionManager.getMetadata(sessionId);
        const existingNames = metadata.nodes.map((n) => n.filename);
        const withExt = (v: string) => (v.endsWith(".ts") ? v : `${v}.ts`);

        const name = await vscode.window.showInputBox({
          prompt: "Transform file name",
          value: nextTransformName(existingNames),
          validateInput: (v) => validateFileName(withExt(v), existingNames),
        });
        if (name === undefined) {
          return;
        }
        const transformFilename = withExt(name);

        const sessionUri = sessionManager.getSessionUri(sessionId);
        const parentUri = vscode.Uri.joinPath(sessionUri, node.filename);
        let typeDefinition = "any";

        try {
          const parentContentBytes =
            await vscode.workspace.fs.readFile(parentUri);
          const parentContent = new TextDecoder().decode(parentContentBytes);
          typeDefinition = typeDefForFile(node.filename, parentContent);
        } catch (e) {
          log.appendLine(`Failed to infer type: ${e}`);
        }

        const transformUri = vscode.Uri.joinPath(sessionUri, transformFilename);
        await vscode.workspace.fs.writeFile(
          transformUri,
          new TextEncoder().encode(transformTemplate(typeDefinition)),
        );

        await sessionManager.addNode(sessionId, {
          id: Date.now().toString(),
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

  const resolveTransform = async (
    nodeOrUri: PipelineNode | vscode.Uri | undefined,
  ): Promise<PipelineNode | undefined> => {
    const sessionId = sessionManager.activeSessionId;
    if (!sessionId) {
      vscode.window.showErrorMessage("No active session");
      return undefined;
    }
    let target = nodeOrUri;
    if (!target) {
      target = vscode.window.activeTextEditor?.document.uri;
    }
    let node: PipelineNode | undefined;
    if (target instanceof vscode.Uri) {
      const filename = target.path.split("/").pop();
      const metadata = await sessionManager.getMetadata(sessionId);
      node = metadata.nodes.find((n) => n.filename === filename);
    } else {
      node = target;
    }
    if (!node || node.type !== "transform" || !node.parentId) {
      vscode.window.showErrorMessage("Invalid transformation node");
      return undefined;
    }
    return node;
  };

  let runTransformCommand = vscode.commands.registerCommand(
    "jscratch.runTransform",
    async (nodeOrUri?: PipelineNode | vscode.Uri) => {
      const node = await resolveTransform(nodeOrUri);
      if (node) {
        await executor.run(node);
      }
    },
  );

  let runBranchCommand = vscode.commands.registerCommand(
    "jscratch.runBranch",
    async (nodeOrUri?: PipelineNode | vscode.Uri) => {
      const node = await resolveTransform(nodeOrUri);
      if (node) {
        await executor.runBranch(node);
      }
    },
  );

  const formats: DataFormat[] = ["json", "csv", "ndjson", "txt"];
  let setOutputFormatCommand = vscode.commands.registerCommand(
    "jscratch.setOutputFormat",
    async (node: PipelineNode) => {
      const sessionId = sessionManager.activeSessionId;
      if (!sessionId || !node) {
        return;
      }
      const current = node.outputFormat ?? defaultFormat();
      const picked = await vscode.window.showQuickPick(
        formats.map((f) => ({
          label: f,
          description: f === current ? "current" : undefined,
        })),
        { placeHolder: "Output format for " + node.filename },
      );
      if (picked) {
        await sessionManager.updateNode(sessionId, node.id, {
          outputFormat: picked.label as DataFormat,
        });
      }
    },
  );

  const runOnSave = vscode.workspace.onDidSaveTextDocument(async (doc) => {
    if (
      doc.uri.scheme !== "datalab" ||
      !doc.uri.path.endsWith(".ts") ||
      !vscode.workspace
        .getConfiguration("jscratch.pipeline")
        .get<boolean>("runOnSave", false)
    ) {
      return;
    }
    const sessionId = sessionManager.activeSessionId;
    if (!sessionId || doc.uri.path.split("/")[1] !== sessionId) {
      return;
    }
    const filename = doc.uri.path.split("/").pop();
    const metadata = await sessionManager.getMetadata(sessionId);
    const node = metadata.nodes.find((n) => n.filename === filename);
    if (node && node.type === "transform") {
      await executor.run(node);
    }
  });

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

  let deleteNodeCommand = vscode.commands.registerCommand(
    "jscratch.deleteNode",
    async (node: PipelineNode) => {
      if (!sessionManager.activeSessionId || !node) {
        return;
      }

      const answer = await vscode.window.showWarningMessage(
        `Are you sure you want to delete '${node.label}'? All subsequent nodes will also be deleted.`,
        "Yes",
        "No",
      );

      if (answer === "Yes") {
        try {
          await sessionManager.deleteNode(
            sessionManager.activeSessionId,
            node.id,
          );
        } catch (error) {
          vscode.window.showErrorMessage(`Failed to delete node: ${error}`);
        }
      }
    },
  );

  let reloadTypesCommand = vscode.commands.registerCommand(
    "jscratch.reloadTypes",
    async (node: PipelineNode) => {
      if (!sessionManager.activeSessionId || !node || !node.parentId) {
        return;
      }

      try {
        const sessionUri = sessionManager.getSessionUri(
          sessionManager.activeSessionId,
        );

        // 1. Get Parent Node (Input)
        const parentNode = await sessionManager.getNode(
          sessionManager.activeSessionId,
          node.parentId,
        );
        if (!parentNode) {
          vscode.window.showErrorMessage("Parent node not found");
          return;
        }

        // 2. Infer Type from Parent File
        const parentUri = vscode.Uri.joinPath(sessionUri, parentNode.filename);
        let typeDefinition = "any";

        try {
          const parentContentBytes =
            await vscode.workspace.fs.readFile(parentUri);
          const parentContent = new TextDecoder().decode(parentContentBytes);
          typeDefinition = typeDefForFile(parentNode.filename, parentContent);
        } catch (e) {
          log.appendLine(`Failed to infer type: ${e}`);
        }

        // 3. Update Transformation File
        const transformUri = vscode.Uri.joinPath(sessionUri, node.filename);
        const transformContentBytes =
          await vscode.workspace.fs.readFile(transformUri);
        const transformContent = new TextDecoder().decode(
          transformContentBytes,
        );

        const newContent =
          replaceTypeDefs(transformContent, typeDefinition) ?? transformContent;

        if (newContent !== transformContent) {
          await vscode.workspace.fs.writeFile(
            transformUri,
            new TextEncoder().encode(newContent),
          );
          vscode.window.showInformationMessage(
            "Type definitions reloaded successfully.",
          );
        } else {
          vscode.window.showInformationMessage(
            "Type definitions are already up to date.",
          );
        }
      } catch (error) {
        vscode.window.showErrorMessage(`Failed to reload types: ${error}`);
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
    runBranchCommand,
    setOutputFormatCommand,
    runOnSave,
    exportFileCommand,
    clearHistoryCommand,
    deleteNodeCommand,
    reloadTypesCommand,
  );
}
