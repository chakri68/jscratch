import * as vscode from "vscode";
import { execSync } from "child_process";

export async function getTsxPath(): Promise<string | undefined> {
  // 1. Check VSCode settings first (if they've already set it)
  const config = vscode.workspace.getConfiguration("jscratch");
  const savedPath = config.get<string>("tsxPath");

  if (savedPath) return savedPath;

  // 2. Try to find it automatically
  try {
    return execSync("which tsx", { encoding: "utf8" }).trim();
  } catch {
    // 3. Fallback: Show error with options
    const choice = await vscode.window.showErrorMessage(
      "Global 'tsx' not found in your PATH.",
      "Install Globally",
      "Set Path Manually"
    );

    if (choice === "Install Globally") {
      const terminal = vscode.window.createTerminal("Install tsx");
      terminal.sendText("npm install -g tsx");
      terminal.show();
    } else if (choice === "Set Path Manually") {
      return await selectPathManually();
    }
  }
  return undefined;
}

async function selectPathManually(): Promise<string | undefined> {
  const chosenPath = await vscode.window.showInputBox({
    prompt: "Enter the absolute path to 'tsx' binary (which tsx)",
    placeHolder: "e.g. /usr/local/bin/tsx or C:\\npm\\tsx.cmd",
    ignoreFocusOut: true,
    validateInput: (value) => {
      if (!value) return "Path cannot be empty";
      return null; // Return null if valid
    },
  });

  if (chosenPath) {
    try {
      // Verify the path actually works by checking the version
      execSync(`"${chosenPath}" -v`, { encoding: "utf8" });

      // If it didn't throw, save it to Global Settings
      await vscode.workspace
        .getConfiguration("jscratch")
        .update("tsxPath", chosenPath, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(
        `Success! tsx path set to: ${chosenPath}`
      );
      return chosenPath;
    } catch (err) {
      vscode.window.showErrorMessage(
        `Err: ${err}. Please ensure the path is correct and points to a valid 'tsx' binary.`
      );
      return undefined;
    }
  }

  return undefined;
}
