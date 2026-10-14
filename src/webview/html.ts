import * as crypto from "crypto";
import * as vscode from "vscode";

/** Webview options shared by every JScratch panel. */
export function webviewOptions(
  extUri: vscode.Uri,
): vscode.WebviewOptions & vscode.WebviewPanelOptions {
  return {
    enableScripts: true,
    retainContextWhenHidden: false,
    localResourceRoots: [
      vscode.Uri.joinPath(extUri, "out", "webview"),
      vscode.Uri.joinPath(extUri, "media"),
    ],
  };
}

/** HTML shell: strict CSP, one nonce'd script, body is just `#app`. */
export function renderHtml(
  webview: vscode.Webview,
  extUri: vscode.Uri,
  opts: { script: "toolbox" | "preview"; title: string },
): string {
  const nonce = crypto.randomBytes(16).toString("base64");
  const asset = (name: string) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extUri, "out", "webview", name));
  const csp = `default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; font-src ${webview.cspSource}; script-src 'nonce-${nonce}';`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy" content="${csp}">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${escapeHtml(opts.title)}</title>
  <link rel="stylesheet" id="vscode-codicon-stylesheet" href="${asset("codicon.css")}">
  <link rel="stylesheet" href="${asset("styles.css")}">
</head>
<body>
  <div id="app"></div>
  <script nonce="${nonce}" src="${asset(`${opts.script}.js`)}"></script>
</body>
</html>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
