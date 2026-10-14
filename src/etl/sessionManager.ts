import * as vscode from "vscode";
import * as path from "path";

export interface PipelineNode {
  id: string;
  type: "input" | "transform" | "output";
  label: string;
  filename: string;
  parentId?: string;
}

export interface SessionMetadata {
  id: string;
  created: string;
  name?: string;
  nodes: PipelineNode[];
}

export class SessionManager {
  private currentSessionId: string | undefined;
  private _onDidSessionChange = new vscode.EventEmitter<void>();
  readonly onDidSessionChange: vscode.Event<void> =
    this._onDidSessionChange.event;

  constructor(private readonly storageUri: vscode.Uri) {}

  public async createSession(name?: string): Promise<string> {
    const sessionId = new Date().toISOString().replace(/[:.]/g, "-");
    this.currentSessionId = sessionId;

    const sessionUri = this.getSessionUri(sessionId);
    await vscode.workspace.fs.createDirectory(sessionUri);

    // Initialize metadata
    const metadata: SessionMetadata = {
      id: sessionId,
      created: new Date().toISOString(),
      name: name || sessionId,
      nodes: [],
    };
    await this.saveMetadata(sessionId, metadata);

    this._onDidSessionChange.fire();
    return sessionId;
  }

  public setSession(sessionId: string) {
    this.currentSessionId = sessionId;
    this._onDidSessionChange.fire();
  }

  public async getSessions(): Promise<SessionMetadata[]> {
    try {
      const entries = await vscode.workspace.fs.readDirectory(this.storageUri);
      const sessions: SessionMetadata[] = [];

      for (const [name, type] of entries) {
        if (type === vscode.FileType.Directory) {
          try {
            const metadata = await this.getMetadata(name);
            sessions.push(metadata);
          } catch {
            // Ignore invalid sessions
          }
        }
      }

      return sessions.sort(
        (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
      );
    } catch {
      return [];
    }
  }

  public async deleteSession(sessionId: string): Promise<void> {
    const sessionUri = this.getSessionUri(sessionId);
    await vscode.workspace.fs.delete(sessionUri, { recursive: true });

    if (this.currentSessionId === sessionId) {
      this.currentSessionId = undefined;
    }
    this._onDidSessionChange.fire();
  }

  public async clearHistory(): Promise<void> {
    const sessions = await this.getSessions();
    for (const session of sessions) {
      await this.deleteSession(session.id);
    }
  }

  public get activeSessionId(): string | undefined {
    return this.currentSessionId;
  }

  public getSessionUri(sessionId: string): vscode.Uri {
    return vscode.Uri.parse(`datalab:/${sessionId}/`);
  }

  public async getMetadata(sessionId: string): Promise<SessionMetadata> {
    const uri = vscode.Uri.joinPath(
      this.getSessionUri(sessionId),
      "pipeline.json",
    );
    try {
      const content = await vscode.workspace.fs.readFile(uri);
      return JSON.parse(new TextDecoder().decode(content));
    } catch {
      return { id: sessionId, created: new Date().toISOString(), nodes: [] };
    }
  }

  public async saveMetadata(
    sessionId: string,
    metadata: SessionMetadata,
  ): Promise<void> {
    const uri = vscode.Uri.joinPath(
      this.getSessionUri(sessionId),
      "pipeline.json",
    );
    await vscode.workspace.fs.writeFile(
      uri,
      new TextEncoder().encode(JSON.stringify(metadata, null, 2)),
    );
    this._onDidSessionChange.fire();
  }

  public async addNode(sessionId: string, node: PipelineNode): Promise<void> {
    const metadata = await this.getMetadata(sessionId);
    metadata.nodes.push(node);
    await this.saveMetadata(sessionId, metadata);
  }

  public async getNode(
    sessionId: string,
    nodeId: string,
  ): Promise<PipelineNode | undefined> {
    const metadata = await this.getMetadata(sessionId);
    return metadata.nodes.find((n) => n.id === nodeId);
  }

  public async deleteNode(sessionId: string, nodeId: string): Promise<void> {
    const metadata = await this.getMetadata(sessionId);
    const nodesToDelete = new Set<string>();
    const sessionUri = this.getSessionUri(sessionId);

    // Helper to recursively find descendants
    const collectDescendants = (parentId: string) => {
      nodesToDelete.add(parentId);
      const children = metadata.nodes.filter((n) => n.parentId === parentId);
      for (const child of children) {
        collectDescendants(child.id);
      }
    };

    collectDescendants(nodeId);

    // Delete files
    for (const id of nodesToDelete) {
      const node = metadata.nodes.find((n) => n.id === id);
      if (node) {
        try {
          const fileUri = vscode.Uri.joinPath(sessionUri, node.filename);
          await vscode.workspace.fs.delete(fileUri);
        } catch {
          // Ignore if file doesn't exist
        }
      }
    }

    // Update metadata
    metadata.nodes = metadata.nodes.filter((n) => !nodesToDelete.has(n.id));
    await this.saveMetadata(sessionId, metadata);
  }
}
