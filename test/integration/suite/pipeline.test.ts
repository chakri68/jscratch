import * as assert from "assert";
import * as vscode from "vscode";
import type { JScratchApi } from "../../../src/extension";
import { SessionManager } from "../../../src/etl/sessionManager";

const enc = new TextEncoder();
const dec = new TextDecoder();

async function waitFor<T>(
  fn: () => T | undefined,
  timeoutMs = 5000,
): Promise<T | undefined> {
  const end = Date.now() + timeoutMs;
  for (;;) {
    const v = fn();
    if (v !== undefined || Date.now() > end) {
      return v;
    }
    await new Promise((r) => setTimeout(r, 100));
  }
}

suite("JScratch integration", () => {
  let api: JScratchApi;
  const created: string[] = [];

  suiteSetup(async () => {
    const ext = vscode.extensions.getExtension("chakri68.jscratch");
    assert.ok(ext, "extension not found");
    api = await ext.activate();
    assert.ok(api?.sessionManager, "activate() did not return the api");
  });

  teardown(async () => {
    for (const id of created.splice(0)) {
      await api.sessionManager.deleteSession(id).catch(() => undefined);
    }
    await vscode.commands.executeCommand("workbench.action.closeAllEditors");
  });

  async function newSession(name: string): Promise<string> {
    const id = await api.sessionManager.createSession(name);
    created.push(id);
    return id;
  }

  test("registers commands", async () => {
    const all = await vscode.commands.getCommands(true);
    for (const c of [
      "jscratch.newSession",
      "jscratch.openToolbox",
      "jscratch.preview",
    ]) {
      assert.ok(all.includes(c), `${c} not registered`);
    }
  });

  async function runPipeline(): Promise<{ id: string; outUri: vscode.Uri }> {
    const sm = api.sessionManager;
    const id = await newSession("t");
    const dir = sm.getSessionUri(id);
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(dir, "data.csv"),
      enc.encode("name\nA\nB"),
    );
    await sm.addNode(id, {
      id: "in1",
      type: "input",
      label: "data.csv",
      filename: "data.csv",
    });
    await vscode.workspace.fs.writeFile(
      vscode.Uri.joinPath(dir, "transform-1.ts"),
      enc.encode(
        "declare const input: any;\nexport function transform() { return input.data.map((r: any) => r.name); }\n",
      ),
    );
    const node = {
      id: "tr1",
      type: "transform" as const,
      label: "transform-1.ts",
      filename: "transform-1.ts",
      parentId: "in1",
      outputFormat: "json" as const,
    };
    await sm.addNode(id, node);
    assert.strictEqual(await api.executor.run(node), true);
    return { id, outUri: vscode.Uri.joinPath(dir, "transform-1.out.json") };
  }

  test("csv -> transform -> json output", async () => {
    const { id, outUri } = await runPipeline();
    const text = dec.decode(await vscode.workspace.fs.readFile(outUri));
    assert.strictEqual(text, JSON.stringify(["A", "B"], null, 2));
    const t = await api.sessionManager.getNode(id, "tr1");
    assert.strictEqual(t?.lastRun?.ok, true);
  });

  test("restores the active session", async () => {
    const id = await newSession("restore");
    api.sessionManager.setSession(id);
    // setSession persists without awaiting; wait until the memento has it.
    await waitFor(() =>
      api.globalState.get("jscratch.activeSessionId") === id ? true : undefined,
    );
    const fresh = new SessionManager(api.storageUri, api.globalState);
    await fresh.restore();
    assert.strictEqual(fresh.activeSessionId, id);
  });

  test("preview opens a webview panel", async () => {
    const { outUri } = await runPipeline();
    await vscode.commands.executeCommand("jscratch.preview", outUri);
    const tab = await waitFor(() =>
      vscode.window.tabGroups.all
        .flatMap((g) => g.tabs)
        .find((t) => t.input instanceof vscode.TabInputWebview),
    );
    assert.ok(tab, "no webview tab opened");
  });
});
