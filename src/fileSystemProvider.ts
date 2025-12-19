import * as vscode from "vscode";
import * as fs from "fs";
import * as path from "path";

export class JScratchFileSystemProvider implements vscode.FileSystemProvider {
  private _onDidChangeFile = new vscode.EventEmitter<
    vscode.FileChangeEvent[]
  >();
  readonly onDidChangeFile: vscode.Event<vscode.FileChangeEvent[]> =
    this._onDidChangeFile.event;

  constructor(private storageRoot: vscode.Uri) {
    if (!fs.existsSync(storageRoot.fsPath)) {
      fs.mkdirSync(storageRoot.fsPath, { recursive: true });
    }
  }

  private getPhysicalPath(uri: vscode.Uri): string {
    return path.join(this.storageRoot.fsPath, uri.path);
  }

  watch(
    uri: vscode.Uri,
    options: { recursive: boolean; excludes: string[] },
  ): vscode.Disposable {
    // Ignoring watch for now as it's a scratchpad
    return new vscode.Disposable(() => {});
  }

  stat(uri: vscode.Uri): vscode.FileStat {
    const filePath = this.getPhysicalPath(uri);
    try {
      const stats = fs.statSync(filePath);
      return {
        type: stats.isFile()
          ? vscode.FileType.File
          : stats.isDirectory()
            ? vscode.FileType.Directory
            : vscode.FileType.Unknown,
        ctime: stats.ctimeMs,
        mtime: stats.mtimeMs,
        size: stats.size,
      };
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  readDirectory(uri: vscode.Uri): [string, vscode.FileType][] {
    const dirPath = this.getPhysicalPath(uri);
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      return entries.map((entry) => [
        entry.name,
        entry.isFile()
          ? vscode.FileType.File
          : entry.isDirectory()
            ? vscode.FileType.Directory
            : vscode.FileType.Unknown,
      ]);
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  createDirectory(uri: vscode.Uri): void {
    const dirPath = this.getPhysicalPath(uri);
    try {
      fs.mkdirSync(dirPath, { recursive: true });
      this._fireSoon({ type: vscode.FileChangeType.Created, uri });
    } catch (error) {
      throw vscode.FileSystemError.Unavailable(uri);
    }
  }

  readFile(uri: vscode.Uri): Uint8Array {
    const filePath = this.getPhysicalPath(uri);
    try {
      const content = fs.readFileSync(filePath);
      return new Uint8Array(content);
    } catch (error) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
  }

  writeFile(
    uri: vscode.Uri,
    content: Uint8Array,
    options: { create: boolean; overwrite: boolean },
  ): void {
    const filePath = this.getPhysicalPath(uri);
    const exists = fs.existsSync(filePath);

    if (!exists && !options.create) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }
    if (exists && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(uri);
    }

    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content);
    this._fireSoon({
      type: exists
        ? vscode.FileChangeType.Changed
        : vscode.FileChangeType.Created,
      uri,
    });
  }

  delete(uri: vscode.Uri, options: { recursive: boolean }): void {
    const filePath = this.getPhysicalPath(uri);
    if (!fs.existsSync(filePath)) {
      throw vscode.FileSystemError.FileNotFound(uri);
    }

    try {
      fs.rmSync(filePath, { recursive: options.recursive });
      this._fireSoon({ type: vscode.FileChangeType.Deleted, uri });
    } catch (error) {
      throw vscode.FileSystemError.Unavailable(uri);
    }
  }

  rename(
    oldUri: vscode.Uri,
    newUri: vscode.Uri,
    options: { overwrite: boolean },
  ): void {
    const oldPath = this.getPhysicalPath(oldUri);
    const newPath = this.getPhysicalPath(newUri);

    if (!fs.existsSync(oldPath)) {
      throw vscode.FileSystemError.FileNotFound(oldUri);
    }
    if (fs.existsSync(newPath) && !options.overwrite) {
      throw vscode.FileSystemError.FileExists(newUri);
    }

    fs.renameSync(oldPath, newPath);
    this._fireSoon(
      { type: vscode.FileChangeType.Deleted, uri: oldUri },
      { type: vscode.FileChangeType.Created, uri: newUri },
    );
  }

  private _fireSoon(...events: vscode.FileChangeEvent[]): void {
    this._onDidChangeFile.fire(events);
  }
}
