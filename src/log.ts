import * as vscode from "vscode";

/** Shared "JScratch" output channel. Disposed via the extension's subscriptions. */
export const log = vscode.window.createOutputChannel("JScratch");
