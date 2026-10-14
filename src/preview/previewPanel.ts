import * as vscode from "vscode";
import { parse, tabulate } from "../etl/formats";
import type { PipelineNode } from "../etl/model";
import type { SessionManager } from "../etl/sessionManager";
import { renderHtml, webviewOptions } from "../webview/html";
import type { PreviewFromWebview, PreviewToWebview } from "../webview/protocol";
import { columnSchema, describeValue } from "./schema";
import { log } from "../log";

const MAX_BYTES = 50 * 1024 * 1024;
const REFRESH_DEBOUNCE_MS = 200;

let extensionUri: vscode.Uri;
let onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]>;

/** Registers `jscratch.preview`. Takes a tree node, a Uri, or nothing (the active editor's file). */
export function registerPreview(
  context: vscode.ExtensionContext,
  sessions: SessionManager,
  fileChanges: vscode.Event<vscode.FileChangeEvent[]>,
): void {
  extensionUri = context.extensionUri;
  onDidChangeFile = fileChanges;
  context.subscriptions.push(
    vscode.commands.registerCommand("jscratch.preview", (arg?: unknown) => {
      const uri = resolveTarget(arg, sessions);
      if (uri) {
        PreviewPanel.show(uri);
      } else {
        vscode.window.showErrorMessage("No file to preview.");
      }
    }),
  );
}

function resolveTarget(arg: unknown, sessions: SessionManager): vscode.Uri | undefined {
  if (arg instanceof vscode.Uri) {
    return arg;
  }
  if (isNode(arg)) {
    const sessionId = sessions.activeSessionId;
    return sessionId
      ? vscode.Uri.joinPath(sessions.getSessionUri(sessionId), arg.filename)
      : undefined;
  }
  const editor = vscode.window.activeTextEditor?.document.uri;
  if (editor) {
    return editor;
  }
  const input = vscode.window.tabGroups.activeTabGroup.activeTab?.input;
  return input instanceof vscode.TabInputText ? input.uri : undefined;
}

function isNode(arg: unknown): arg is PipelineNode {
  return (
    typeof arg === "object" &&
    arg !== null &&
    typeof (arg as PipelineNode).filename === "string"
  );
}

function basename(uri: vscode.Uri): string {
  return uri.path.split("/").pop() || uri.path;
}

/** True for an event on the file itself or on a folder above it (a deleted session). */
function touches(changed: vscode.Uri, key: string): boolean {
  const c = changed.toString();
  return c === key || key.startsWith(c.endsWith("/") ? c : `${c}/`);
}

function isGone(e: unknown): boolean {
  return e instanceof vscode.FileSystemError && e.code === "FileNotFound";
}

export class PreviewPanel {
  private static readonly panels = new Map<string, PreviewPanel>();
  // False until the script says ready, and again whenever the panel hides: a hidden
  // webview is torn down (retainContextWhenHidden is off) and reloads on reveal.
  private ready = false;
  private loadedOnce = false;
  private seq = 0;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private readonly disposables: vscode.Disposable[] = [];

  private constructor(
    private readonly panel: vscode.WebviewPanel,
    private readonly uri: vscode.Uri,
  ) {
    const key = uri.toString();
    panel.webview.html = renderHtml(panel.webview, extensionUri, {
      script: "preview",
      title: panel.title,
    });
    this.disposables.push(
      panel.webview.onDidReceiveMessage((m: PreviewFromWebview) => this.handle(m)),
      panel.onDidChangeViewState(() => {
        if (!panel.visible) {
          this.ready = false;
        }
      }),
      onDidChangeFile((events) => {
        if (events.some((e) => touches(e.uri, key))) {
          this.scheduleRefresh();
        }
      }),
    );
    panel.onDidDispose(() => {
      PreviewPanel.panels.delete(key);
      clearTimeout(this.timer);
      this.seq++; // drop any read in flight
      vscode.Disposable.from(...this.disposables).dispose();
    });
  }

  static show(uri: vscode.Uri): void {
    const key = uri.toString();
    const existing = PreviewPanel.panels.get(key);
    if (existing) {
      existing.panel.reveal();
      return;
    }
    const panel = vscode.window.createWebviewPanel(
      "jscratch.preview",
      `Preview: ${basename(uri)}`,
      vscode.ViewColumn.Beside,
      webviewOptions(extensionUri),
    );
    const icon = (suffix: string) =>
      vscode.Uri.joinPath(extensionUri, "media", "nodes", `output${suffix}.svg`);
    panel.iconPath = { light: icon(""), dark: icon("-dark") };
    PreviewPanel.panels.set(key, new PreviewPanel(panel, uri));
  }

  private scheduleRefresh(): void {
    clearTimeout(this.timer);
    this.timer = setTimeout(() => {
      // A hidden panel reloads on reveal and asks again via ready.
      if (this.ready) {
        void this.refresh();
      }
    }, REFRESH_DEBOUNCE_MS);
  }

  private async refresh(): Promise<void> {
    const seq = ++this.seq;
    let msg: PreviewToWebview;
    try {
      msg = await this.load();
    } catch (e) {
      log.appendLine(`Preview: failed to read ${this.uri.toString()}: ${e}`);
      const reason = e instanceof Error ? e.message : String(e);
      msg = { type: "notTabular", file: basename(this.uri), summary: `Couldn't read file: ${reason}` };
    }
    if (seq === this.seq && this.ready) {
      await this.panel.webview.postMessage(msg);
    }
  }

  private async load(): Promise<PreviewToWebview> {
    const file = basename(this.uri);
    let size: number;
    try {
      size = (await vscode.workspace.fs.stat(this.uri)).size;
    } catch (e) {
      if (isGone(e)) {
        const summary = this.loadedOnce ? "File was deleted" : "File not found";
        return { type: "notTabular", file, summary };
      }
      throw e;
    }
    this.loadedOnce = true;
    if (size > MAX_BYTES) {
      const mb = (size / 1024 / 1024).toFixed(1);
      return { type: "notTabular", file, summary: `File too large to preview (${mb} MB)` };
    }
    const raw = new TextDecoder().decode(await vscode.workspace.fs.readFile(this.uri));
    const { data, warning } = parse(file, raw);
    if (warning) {
      log.appendLine(`Preview: ${warning}`);
    }
    const table = tabulate(data);
    if (!table) {
      return { type: "notTabular", file, summary: describeValue(data), warning };
    }
    const maxRows = vscode.workspace
      .getConfiguration("jscratch.preview")
      .get<number>("maxRows", 1000);
    return {
      type: "data",
      file,
      columns: table.columns,
      rows: table.rows.slice(0, Math.max(1, maxRows)),
      totalRows: table.rows.length,
      schema: columnSchema(table.columns, table.rows),
      warning,
    };
  }

  private async handle(m: PreviewFromWebview): Promise<void> {
    try {
      switch (m.type) {
        case "ready":
          this.ready = true;
          return await this.refresh();
        case "openAsText":
          await vscode.commands.executeCommand("vscode.open", this.uri);
          return;
        default:
          log.appendLine(`Preview: ignoring message ${JSON.stringify(m).slice(0, 200)}`);
      }
    } catch (e) {
      log.appendLine(`Preview: ${e}`);
      const reason = e instanceof Error ? e.message : String(e);
      vscode.window.showErrorMessage(`Preview failed: ${reason}`);
    }
  }
}
