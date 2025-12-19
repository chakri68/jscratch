# Design Requirements: JScratch (In-Editor ETL)

## 1. Functional Requirements

### 1.1 Virtual Environment

- **Workspace Isolation:** The extension must operate using a Virtual File System (`vscode.FileSystemProvider`). No files should be created in the user's active project folder.
- **Transient Storage:** All files (inputs, scripts, outputs) must be stored in the extension's `globalStorageUri`.
- **File Schemes:** Use a custom URI scheme (e.g., `datalab://`) to identify and manage scratchpad tabs.

### 1.2 The Pipeline Engine

- **Step Creation:** Users must be able to create an "Input Step" by providing a filename and extension.
- **Transformation Logic:**
- Attach a TypeScript/JavaScript script to any data step.
- Automatic injection of dependencies: `fs`, `path`, and common utilities (e.g., ).
- Provide a global `input` object containing `raw` (string) and `data` (parsed object/array).

- **Execution:** \* Trigger execution on "Save" or via a "Play" button.
- Detect input file type (JSON, CSV, YAML, TXT) and pre-parse data before passing it to the script.
- Capture script output (data, type, and name) to generate the next "Output Step" in the chain.

### 1.3 Session & History Management

- **Session Persistence:** Automatically save the state of a pipeline, including the lineage of files and their content.
- **History Browser:** Ability to view a list of previous sessions, sorted by date.
- **Restoration:** Re-open a session to restore all virtual tabs, script code, and data exactly as it was.
- **Naming:** Allow users to name sessions; otherwise, default to a timestamp.

### 1.4 Data Export

- **Selective Export:** A command to save any virtual file from the pipeline into the user’s actual local filesystem or workspace.

---

## 2. User Experience (UX) Requirements

### 2.1 The "Scratchpad" Feel

- **Low Friction:** Creating a new session should take exactly two clicks.
- **Visual Feedback:** Use a Tree View to list files in the lineage. Clicking a node opens the corresponding file.
- **IntelliSense:** The extension should provide a `.d.ts` file dynamically so that when users write their transformation script, they get autocomplete for the `transform` function and the `input` object.

### 2.2 Error Handling

- **Sandbox Safety:** If a transformation script has an infinite loop or syntax error, the extension must catch it. Provide a manual "Kill Execution" option for unresponsive scripts.
- **Data Validation:** Warn the user if they try to parse a file as JSON that contains invalid syntax.

---

## 3. UI Requirements

### 3.1 Sidebar (Primary Interface)

- **Active Session Pane:** Shows the current pipeline tree.
- **History Pane:** Lists past sessions with "Load" and "Delete" icons.
- **Action Buttons:** Icons for "New Input," "Run All," and "Export."

### 3.2 Editor Enhancements

- **Tab Indicators:** Add a specific prefix or icon (e.g., `🧪`) to tabs belonging to the Data Lab so they are easily distinguished from project files.
- **CodeLens:** Display a `[▶ Run Transformation]` link directly above the `transform` function in the `.ts` files.

---

## 4. Technical Specifications

| Component             | Requirement                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------ |
| **Language**          | TypeScript (for building the extension).                                                                     |
| **Execution Sandbox** | Node.js `vm` module or `worker_threads` for running user scripts safely. Use `tsx` for TypeScript execution. |
| **State Store**       | `context.globalState` for metadata; `context.globalStorageUri` for heavy file content.                       |

---

## 5. Future-Proofing (Non-Functional)

- **Scalability:** (Deferred) The system should handle input files up to 50MB without significant UI lag.
- **Extensibility:** The design should allow for adding "Pre-built" transforms (e.g., "Prettify JSON") in the future.
