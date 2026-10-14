import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import * as cp from "child_process";
import * as esbuild from "esbuild";
import { SessionManager, PipelineNode } from "./sessionManager";

export class Executor {
  constructor(
    private sessionManager: SessionManager,
    private extensionUri: vscode.Uri,
  ) {}

  async runTransform(nodeOrUri: PipelineNode | vscode.Uri) {
    let node: PipelineNode | undefined;
    const sessionId = this.sessionManager.activeSessionId;

    if (!sessionId) {
      vscode.window.showErrorMessage("No active session");
      return;
    }

    if (nodeOrUri instanceof vscode.Uri) {
      // Find node by filename
      const filename = path.basename(nodeOrUri.path);
      const metadata = await this.sessionManager.getMetadata(sessionId);
      node = metadata.nodes.find((n) => n.filename === filename);
    } else {
      node = nodeOrUri;
    }

    if (!node || !node.parentId) {
      vscode.window.showErrorMessage("Invalid transformation node");
      return;
    }

    const sessionUri = this.sessionManager.getSessionUri(sessionId);

    // Get parent node (input)
    const parentNode = await this.sessionManager.getNode(
      sessionId,
      node.parentId,
    );
    if (!parentNode) {
      vscode.window.showErrorMessage("Parent node not found");
      return;
    }

    // Create temp dir
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "jscratch-"));

    try {
      // 1. Materialize Input File
      const inputUri = vscode.Uri.joinPath(sessionUri, parentNode.filename);
      const inputContent = await vscode.workspace.fs.readFile(inputUri);
      const tempInputPath = path.join(tempDir, parentNode.filename);
      fs.writeFileSync(tempInputPath, inputContent);

      // 2. Materialize Transform Script
      const transformUri = vscode.Uri.joinPath(sessionUri, node.filename);
      const transformContent = await vscode.workspace.fs.readFile(transformUri);
      const tempTransformPath = path.join(tempDir, "userTransform.ts");
      fs.writeFileSync(tempTransformPath, transformContent);

      // 3. Create Wrapper Script
      const wrapperPath = path.join(tempDir, "wrapper.ts");
      const wrapperScript = `
import * as fs from 'fs';
import * as path from 'path';
import { transform } from './userTransform';

const inputPath = process.argv[2];
const inputRaw = fs.readFileSync(inputPath, 'utf-8');
const ext = path.extname(inputPath).toLowerCase();

let data: any = inputRaw;
try {
    if (ext === '.json') {
        data = JSON.parse(inputRaw);
    } else if (ext === '.csv') {
        data = inputRaw.split('\\n').map(line => line.split(','));
    } else if (ext === '.txt') {
        data = inputRaw.split('\\n');
    }
} catch (e) {
    // Keep raw if parse fails
}

// Global injection
(global as any).input = {
    raw: inputRaw,
    data: data
};

async function run() {
    try {
        const result = await transform();
        console.log(JSON.stringify(result, null, 2));
    } catch (e) {
        console.error(e);
        process.exit(1);
    }
}

run();
`;
      fs.writeFileSync(wrapperPath, wrapperScript);

      // 4. Compile with esbuild
      const outFile = path.join(tempDir, "out.js");
      try {
        await esbuild.build({
          entryPoints: [wrapperPath],
          bundle: true,
          platform: "node",
          outfile: outFile,
        });
      } catch (e) {
        vscode.window.showErrorMessage(`Compilation failed: ${e}`);
        return;
      }

      // 5. Execute with node
      const args = [outFile, tempInputPath];

      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: "Running transformation...",
          cancellable: true,
        },
        async (progress, token) => {
          return new Promise<void>((resolve, reject) => {
            const child = cp.spawn(process.execPath, args, {
              cwd: tempDir,
              env: { ...process.env },
            });

            let stdout = "";
            let stderr = "";

            child.stdout.on("data", (data) => (stdout += data.toString()));
            child.stderr.on("data", (data) => (stderr += data.toString()));

            token.onCancellationRequested(() => {
              child.kill();
              reject(new Error("Cancelled by user"));
            });

            child.on("close", async (code) => {
              if (code === 0) {
                try {
                  // Check for existing output node
                  const metadata =
                    await this.sessionManager.getMetadata(sessionId);
                  const existingOutputNode = metadata.nodes.find(
                    (n) => n.parentId === node!.id && n.type === "output",
                  );

                  let outputFilename: string;
                  let outputUri: vscode.Uri;

                  if (existingOutputNode) {
                    outputFilename = existingOutputNode.filename;
                    outputUri = vscode.Uri.joinPath(sessionUri, outputFilename);
                  } else {
                    outputFilename = `output-${Date.now()}.json`;
                    outputUri = vscode.Uri.joinPath(sessionUri, outputFilename);
                  }

                  // 5. Save Output
                  await vscode.workspace.fs.writeFile(
                    outputUri,
                    new TextEncoder().encode(stdout),
                  );

                  // 6. Add Output Node if it didn't exist
                  if (!existingOutputNode) {
                    await this.sessionManager.addNode(sessionId, {
                      id: Date.now().toString(),
                      type: "output",
                      label: outputFilename,
                      filename: outputFilename,
                      parentId: node!.id,
                    });
                  }

                  // Open Output
                  const doc =
                    await vscode.workspace.openTextDocument(outputUri);
                  await vscode.window.showTextDocument(doc, {
                    viewColumn: vscode.ViewColumn.Beside,
                  });
                  resolve();
                } catch (e) {
                  reject(e);
                }
              } else {
                reject(new Error(stderr || "Unknown error"));
              }
            });
          });
        },
      );
    } catch (error: any) {
      vscode.window.showErrorMessage(
        `Execution failed: ${error.message || error}`,
      );
    } finally {
      // Cleanup
      try {
        fs.rmSync(tempDir, { recursive: true, force: true });
      } catch {}
    }
  }
}
