import * as path from "path";
import * as os from "os";
import * as fs from "fs";
import { runTests } from "@vscode/test-electron";

async function main() {
  const root = path.resolve(__dirname, "../../..");
  fs.mkdirSync(path.join(root, ".vscode-test"), { recursive: true });
  const userDataDir = fs.mkdtempSync(path.join(root, ".vscode-test", "ud-"));
  const workspace = fs.mkdtempSync(path.join(os.tmpdir(), "jscratch-ws-"));
  try {
    await runTests({
      extensionDevelopmentPath: root,
      extensionTestsPath: path.resolve(__dirname, "suite/index"),
      launchArgs: [
        workspace,
        "--disable-extensions",
        `--user-data-dir=${userDataDir}`,
      ],
    });
  } finally {
    fs.rmSync(userDataDir, { recursive: true, force: true });
    fs.rmSync(workspace, { recursive: true, force: true });
  }
}

main().catch((e) => {
  console.error("Failed to run tests:", e);
  process.exit(1);
});
