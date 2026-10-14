import * as vscode from "vscode";

export class TransformCodeLensProvider implements vscode.CodeLensProvider {
  provideCodeLenses(
    document: vscode.TextDocument,
    token: vscode.CancellationToken,
  ): vscode.CodeLens[] {
    if (
      document.uri.scheme !== "datalab" ||
      !document.uri.path.endsWith(".ts")
    ) {
      return [];
    }

    const text = document.getText();
    const match = /export\s+function\s+transform/.exec(text);
    if (match) {
      const line = document.positionAt(match.index).line;
      const range = new vscode.Range(line, 0, line, 0);
      const cmd: vscode.Command = {
        title: "▶ Run Transformation",
        command: "jscratch.runTransform",
        arguments: [document.uri],
      };
      return [new vscode.CodeLens(range, cmd)];
    }
    return [];
  }
}
