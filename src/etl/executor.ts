import * as vscode from "vscode";
import { SessionManager, PipelineNode } from "./sessionManager";
import { runTransform } from "./runner";
import { serialize, DataFormat } from "./formats";
import { outputFilenameFor } from "./names";
import { log } from "../log";

function firstLine(text: string | undefined): string {
  return (text ?? "").split(/\r?\n/).find((l) => l.trim()) ?? "Unknown error";
}

export class Executor {
  private running = new Set<string>();

  constructor(
    private sessionManager: SessionManager,
    private extensionUri: vscode.Uri,
  ) {}

  /** Run one transform. Resolves true on success, false on any failure. */
  async run(node: PipelineNode): Promise<boolean> {
    const sessionId = this.sessionManager.activeSessionId;
    if (!sessionId) {
      vscode.window.showErrorMessage("No active session");
      return false;
    }
    // Re-read so format/filename changes made since the tree was rendered apply.
    const current =
      (await this.sessionManager.getNode(sessionId, node.id)) ?? node;
    if (current.type !== "transform" || !current.parentId) {
      vscode.window.showErrorMessage("Invalid transformation node");
      return false;
    }
    if (this.running.has(current.id)) {
      vscode.window.showInformationMessage(
        `${current.filename} is already running`,
      );
      return false;
    }
    this.running.add(current.id);
    try {
      return await this.runInner(sessionId, current);
    } finally {
      this.running.delete(current.id);
    }
  }

  private async runInner(
    sessionId: string,
    node: PipelineNode,
  ): Promise<boolean> {
    const tag = `[${node.filename}]`;
    const sessionUri = this.sessionManager.getSessionUri(sessionId);
    const parentNode = await this.sessionManager.getNode(
      sessionId,
      node.parentId!,
    );
    if (!parentNode) {
      vscode.window.showErrorMessage("Parent node not found");
      return false;
    }

    const fail = async (error: string, durationMs: number): Promise<false> => {
      const line = firstLine(error);
      for (const l of error.split(/\r?\n/)) {
        log.appendLine(`${tag} ${l}`);
      }
      await this.sessionManager.updateNode(sessionId, node.id, {
        lastRun: { at: Date.now(), ok: false, durationMs, error: line },
      });
      void vscode.window
        .showErrorMessage(
          `Transform failed: ${line}`,
          "Show Log",
          "Open Script",
        )
        .then(async (choice) => {
          if (choice === "Show Log") {
            log.show(true);
          } else if (choice === "Open Script") {
            const doc = await vscode.workspace.openTextDocument(
              vscode.Uri.joinPath(sessionUri, node.filename),
            );
            await vscode.window.showTextDocument(doc);
          }
        });
      return false;
    };

    const started = Date.now();
    let inputRaw: string;
    let scriptSource: string;
    try {
      const dec = new TextDecoder();
      inputRaw = dec.decode(
        await vscode.workspace.fs.readFile(
          vscode.Uri.joinPath(sessionUri, parentNode.filename),
        ),
      );
      scriptSource = dec.decode(
        await vscode.workspace.fs.readFile(
          vscode.Uri.joinPath(sessionUri, node.filename),
        ),
      );
    } catch (e: any) {
      return fail(
        `Could not read files: ${e?.message ?? e}`,
        Date.now() - started,
      );
    }

    const cfg = vscode.workspace.getConfiguration("jscratch.pipeline");
    const timeoutMs = cfg.get<number>("timeoutMs", 60000);
    const format: DataFormat =
      node.outputFormat ?? cfg.get<DataFormat>("defaultOutputFormat", "json");

    const result = await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: `Running ${node.filename}...`,
        cancellable: true,
      },
      (_progress, token) => {
        const ac = new AbortController();
        token.onCancellationRequested(() => ac.abort());
        return runTransform({
          scriptSource,
          inputFilename: parentNode.filename,
          inputRaw,
          timeoutMs,
          signal: ac.signal,
          onLog: (line) => log.appendLine(`${tag} ${line}`),
        });
      },
    );

    if (result.parseWarning) {
      log.appendLine(`${tag} warning: ${result.parseWarning}`);
    }
    if (!result.ok) {
      return fail(result.error ?? "Unknown error", result.durationMs);
    }

    let text: string;
    try {
      text = serialize(format, result.value);
    } catch (e: any) {
      return fail(e?.message ?? String(e), result.durationMs);
    }

    let outputUri: vscode.Uri;
    try {
      const wantedName = outputFilenameFor(node.filename, format);
      const existing = (
        await this.sessionManager.children(sessionId, node.id)
      ).find((n) => n.type === "output");

      if (existing) {
        let outName = existing.filename;
        if (extOf(existing.filename) !== format) {
          await vscode.workspace.fs.rename(
            vscode.Uri.joinPath(sessionUri, existing.filename),
            vscode.Uri.joinPath(sessionUri, wantedName),
            { overwrite: false },
          );
          await this.sessionManager.updateNode(sessionId, existing.id, {
            filename: wantedName,
            label: wantedName,
          });
          outName = wantedName;
        }
        outputUri = vscode.Uri.joinPath(sessionUri, outName);
        await vscode.workspace.fs.writeFile(
          outputUri,
          new TextEncoder().encode(text),
        );
      } else {
        outputUri = vscode.Uri.joinPath(sessionUri, wantedName);
        await vscode.workspace.fs.writeFile(
          outputUri,
          new TextEncoder().encode(text),
        );
        await this.sessionManager.addNode(sessionId, {
          id: Date.now().toString(),
          type: "output",
          label: wantedName,
          filename: wantedName,
          parentId: node.id,
        });
      }
    } catch (e: any) {
      return fail(
        `Could not write output: ${e?.message ?? e}`,
        result.durationMs,
      );
    }

    await this.sessionManager.updateNode(sessionId, node.id, {
      lastRun: { at: Date.now(), ok: true, durationMs: result.durationMs },
    });

    try {
      const doc = await vscode.workspace.openTextDocument(outputUri);
      await vscode.window.showTextDocument(doc, {
        viewColumn: vscode.ViewColumn.Beside,
        preserveFocus: true,
      });
    } catch (e: any) {
      log.appendLine(`${tag} could not open output: ${e?.message ?? e}`);
    }
    return true;
  }

  /** Run `node`, then every descendant transform breadth-first. Stops at the first failure. */
  async runBranch(node: PipelineNode): Promise<void> {
    const sessionId = this.sessionManager.activeSessionId;
    if (!sessionId) {
      vscode.window.showErrorMessage("No active session");
      return;
    }
    const queue: PipelineNode[] = [node];
    while (queue.length) {
      const next = queue.shift()!;
      if (next.type === "transform") {
        if (!(await this.run(next))) {
          return;
        }
      }
      queue.push(...(await this.sessionManager.children(sessionId, next.id)));
    }
  }
}

function extOf(filename: string): string {
  const i = filename.lastIndexOf(".");
  return i < 0 ? "" : filename.slice(i + 1).toLowerCase();
}
