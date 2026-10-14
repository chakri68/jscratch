import * as vscode from "vscode";
import { allTools, resolveTool, runTool } from "../tools/registry";
import type { Tool, ToolResult } from "../tools/types";
import type { ToolMeta, ToolboxFromWebview, ToolboxToWebview } from "../webview/protocol";
import { renderHtml, webviewOptions } from "../webview/html";
import type { SessionManager } from "../etl/sessionManager";
import { addInputFile } from "../etl/inputs";
import { safeInputName, validateFileName } from "../etl/names";
import { guessFormat } from "../etl/formats";
import { log } from "../log";

const LAST_TOOL_KEY = "jscratch.lastTool";
const DIFF_SCHEME = "jscratch-diff";

let sessionManager: SessionManager | undefined;
// The panel steals activeTextEditor, so Insert / Use selection go to the editor focused before it.
let lastEditor: vscode.TextEditor | undefined;

/** Wires the toolbox into the extension: command, editor tracking, diff docs. */
export function registerToolbox(
  context: vscode.ExtensionContext,
  sessions: SessionManager,
): void {
  sessionManager = sessions;
  lastEditor = trackable(vscode.window.activeTextEditor);
  context.subscriptions.push(
    vscode.window.onDidChangeActiveTextEditor((e) => {
      lastEditor = trackable(e) ?? lastEditor;
    }),
    vscode.workspace.registerTextDocumentContentProvider(DIFF_SCHEME, diffDocs),
    vscode.workspace.onDidCloseTextDocument((d) => diffDocs.forget(d.uri)),
    vscode.commands.registerCommand("jscratch.openToolbox", (toolId?: unknown) =>
      ToolboxPanel.show(context, typeof toolId === "string" ? toolId : undefined),
    ),
  );
}

function trackable(e: vscode.TextEditor | undefined): vscode.TextEditor | undefined {
  // Output channels and our own diff docs are editors too, but not ones you insert into.
  if (!e || e.document.uri.scheme === "output" || e.document.uri.scheme === DIFF_SCHEME) {
    return undefined;
  }
  return e;
}

/** Read-only in-memory docs for Open Diff. */
class DiffDocs implements vscode.TextDocumentContentProvider {
  private readonly docs = new Map<string, string>();
  private seq = 0;

  add(label: string, text: string): vscode.Uri {
    const uri = vscode.Uri.from({ scheme: DIFF_SCHEME, path: `/${++this.seq}/${label}` });
    this.docs.set(uri.toString(), text);
    return uri;
  }

  forget(uri: vscode.Uri): void {
    this.docs.delete(uri.toString());
  }

  provideTextDocumentContent(uri: vscode.Uri): string {
    return (
      this.docs.get(uri.toString()) ??
      "(diff content no longer available — run Open Diff again)"
    );
  }
}

const diffDocs = new DiffDocs();

export class ToolboxPanel {
  private static current: ToolboxPanel | undefined;
  // focusTool to deliver once the (re)loaded webview says ready.
  private pending: { id: string; prefill?: string } | undefined;
  // False until the script says ready, and again whenever the panel hides: a hidden
  // webview is torn down (retainContextWhenHidden is off) and reloads on reveal.
  private ready = false;

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly ctx: vscode.ExtensionContext,
  ) {
    panel.webview.html = renderHtml(panel.webview, ctx.extensionUri, {
      script: "toolbox",
      title: "JScratch Toolbox",
    });
    panel.webview.onDidReceiveMessage((m: ToolboxFromWebview) => this.handle(m));
    panel.onDidChangeViewState(() => {
      if (!panel.visible) {
        this.ready = false;
      }
    });
    panel.onDidDispose(() => {
      ToolboxPanel.current = undefined;
    });
  }

  static show(ctx: vscode.ExtensionContext, toolId?: string, prefill?: string): void {
    const existing = ToolboxPanel.current;
    if (existing) {
      existing.panel.reveal();
      if (toolId) {
        existing.focus({ id: toolId, prefill });
      }
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "jscratch.toolbox",
      "JScratch Toolbox",
      vscode.ViewColumn.Active,
      webviewOptions(ctx.extensionUri),
    );
    panel.iconPath = vscode.Uri.joinPath(ctx.extensionUri, "media", "activity.svg");
    const created = new ToolboxPanel(panel, ctx);
    ToolboxPanel.current = created;
    if (toolId) {
      created.pending = { id: toolId, prefill };
    }
  }

  private focus(target: { id: string; prefill?: string }): void {
    if (this.ready) {
      void this.post({ type: "focusTool", ...target });
    } else {
      this.pending = target;
    }
  }

  private post(msg: ToolboxToWebview): Thenable<boolean> {
    return this.panel.webview.postMessage(msg);
  }

  private async handle(m: ToolboxFromWebview): Promise<void> {
    try {
      switch (m.type) {
        case "ready":
          return await this.onReady();
        case "run": {
          // Always answer, so the webview never waits on a request that blew up here.
          let result: ToolResult;
          try {
            result = runTool(m.toolId, m.fields, m.options ?? {});
          } catch (e) {
            log.appendLine(`Toolbox: bad run request: ${e}`);
            result = { ok: false, error: "Bad request" };
          }
          await this.post({ type: "result", requestId: m.requestId, result });
          return;
        }
        case "selected":
          if (knownTool(m.toolId)) {
            await this.ctx.globalState.update(LAST_TOOL_KEY, m.toolId);
          }
          return;
        case "copy":
          await vscode.env.clipboard.writeText(m.text);
          return;
        case "insert":
          return await insertIntoEditor(m.text);
        case "openEditor":
        case "sendToPipeline": {
          const tool = knownTool(m.toolId);
          if (tool) {
            return await (m.type === "openEditor"
              ? openInEditor(m.text, tool, m.options)
              : sendToPipeline(m.text, tool.id));
          }
          return;
        }
        case "openDiff":
          await vscode.commands.executeCommand(
            "vscode.diff",
            diffDocs.add("Left", m.left),
            diffDocs.add("Right", m.right),
            "Left ↔ Right",
          );
          return;
        case "requestSelection": {
          const text = selectionText();
          if (text !== undefined) {
            await this.post({ type: "selection", text });
          }
          return;
        }
        case "requestClipboard":
          await this.post({ type: "selection", text: await vscode.env.clipboard.readText() });
          return;
        default:
          log.appendLine(`Toolbox: ignoring message ${JSON.stringify(m).slice(0, 200)}`);
      }
    } catch (e) {
      log.appendLine(`Toolbox: ${m.type} failed: ${e}`);
      vscode.window.showErrorMessage(`Toolbox: ${e instanceof Error ? e.message : e}`);
    }
  }

  private async onReady(): Promise<void> {
    this.ready = true;
    const tools = allTools().map(toMeta);
    const last = this.ctx.globalState.get<string>(LAST_TOOL_KEY);
    await this.post({ type: "init", tools, selected: resolveTool(last).id });
    const pending = this.pending;
    this.pending = undefined;
    if (pending) {
      await this.post({ type: "focusTool", ...pending });
    }
  }
}

/** The tool with this id, or undefined (logged): the webview's ids aren't trusted blindly. */
function knownTool(id: unknown): Tool | undefined {
  const tool = allTools().find((t) => t.id === id);
  if (!tool) {
    log.appendLine(`Toolbox: ignoring unknown tool id ${JSON.stringify(id)}`);
  }
  return tool;
}

/** Everything but `run`: functions don't survive postMessage, and tools run here anyway. */
function toMeta(tool: Tool): ToolMeta {
  const { run, ...meta } = tool;
  void run;
  return meta;
}

/** Selection of the last real editor, or its whole text when nothing is selected. */
function selectionText(): string | undefined {
  const editor = lastEditor;
  if (!editor || editor.document.isClosed) {
    vscode.window.showInformationMessage("No editor to take a selection from.");
    return undefined;
  }
  return editor.selection.isEmpty
    ? editor.document.getText()
    : editor.document.getText(editor.selection);
}

async function insertIntoEditor(text: string): Promise<void> {
  const editor = lastEditor;
  // A closed-then-reopened file is a new TextDocument; find it again by uri.
  const doc =
    editor && !editor.document.isClosed
      ? editor.document
      : vscode.workspace.textDocuments.find(
          (d) => !d.isClosed && d.uri.toString() === editor?.document.uri.toString(),
        );
  if (!editor || !doc) {
    vscode.window.showInformationMessage("No editor to insert into. Click into one first.");
    return;
  }
  // A WorkspaceEdit works whether or not the editor is still on screen, so the
  // toolbox keeps its tab even when it sits in the same column as the editor.
  const edit = new vscode.WorkspaceEdit();
  for (const s of editor.selections) {
    edit.replace(doc.uri, s, text);
  }
  if (await vscode.workspace.applyEdit(edit)) {
    vscode.window.setStatusBarMessage(
      `$(check) Inserted into ${doc.fileName.split(/[\\/]/).pop()}`,
      2500,
    );
  } else {
    vscode.window.showErrorMessage("Couldn't insert: the editor rejected the edit.");
  }
}

async function openInEditor(
  text: string,
  tool: Tool,
  options: Record<string, unknown> | undefined,
): Promise<void> {
  // ⇄ tools emit JSON when converting back; outputLanguage only describes "to".
  const wanted = options?.direction === "from" ? "json" : tool.outputLanguage;
  // An unregistered id (toml, csv without an extension) would fail the open.
  const language =
    wanted && (await vscode.languages.getLanguages()).includes(wanted) ? wanted : undefined;
  const doc = await vscode.workspace.openTextDocument({ content: text, language });
  await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.Beside });
}

async function sendToPipeline(text: string, toolId: string): Promise<void> {
  const sessions = sessionManager;
  const sessionId = sessions?.activeSessionId;
  if (!sessions || !sessionId) {
    const pick = await vscode.window.showErrorMessage(
      "No active session to send the output to.",
      "New Session",
    );
    if (pick === "New Session") {
      await vscode.commands.executeCommand("jscratch.newSession");
    }
    return;
  }
  const existing = (await sessions.getMetadata(sessionId)).nodes.map((n) => n.filename);
  const name = await vscode.window.showInputBox({
    prompt: "Input file name",
    value: safeInputName(`${toolId}-output.${guessFormat(text)}`, existing),
    validateInput: (v) => validateFileName(v, existing),
  });
  if (!name) {
    return;
  }
  await addInputFile(sessions, sessionId, name, new TextEncoder().encode(text));
  const open = await vscode.window.showInformationMessage(
    `Added ${name} to the pipeline.`,
    "Open",
  );
  if (open === "Open") {
    const doc = await vscode.workspace.openTextDocument(
      vscode.Uri.joinPath(sessions.getSessionUri(sessionId), name),
    );
    await vscode.window.showTextDocument(doc);
  }
}
