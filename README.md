# JScratch

**JScratch** is an "In-Editor ETL Scratchpad" for Visual Studio Code. It allows you to perform quick data transformations, experiments, and pipelines without polluting your main project workspace.

![JScratch Icon](/media/full.png)

## Features

### 🧪 Virtual Workspace

Keep your project clean! JScratch operates entirely within a virtual file system (`datalab://`). All your inputs, scripts, and outputs are stored in a transient global storage, so you never have to worry about accidental commits of scratch files.

### ⚡ TypeScript Transformations

Write powerful transformation scripts using TypeScript.

- **Auto-Injection**: Common modules like `fs` and `path` are available.
- **Type Safety**: Full IntelliSense support for your data structures.
- **Execution**: Scripts are executed securely using `tsx`.

### 🌳 Pipeline Visualization

Visualize your data flow in a dedicated Tree View.

- **Input**: Start with raw data (JSON, CSV, TXT).
- **Transform**: Apply logic.
- **Output**: See the results immediately.

### 📜 Session History

Never lose an experiment.

- **Auto-Save**: Sessions are automatically saved.
- **History Browser**: View, restore, or delete previous sessions from the sidebar.
- **Persistence**: Your pipelines survive VS Code restarts.

### 📤 Export

Happy with your transformation? Export any file from the virtual pipeline directly to your local machine with a single click.

## Getting Started

1.  **Open JScratch**: Click the **Beaker** icon in the Activity Bar.
2.  **New Session**: Click the `+` icon or run `JScratch: New Session`.
3.  **Add Input**: Click the "Create Input" button to create a file (e.g., `data.json`) and paste your raw content.
4.  **Transform**: Right-click the input file in the tree and select **Add Transformation**.
5.  **Code**: Write your logic in the generated `.ts` file. The `input` variable holds your data.

    ```typescript
    import { input } from "./data.json";

    // Your logic here
    const result = input.map((item) => ({ ...item, processed: true }));

    // The return value becomes the content of the next file
    export default result;
    ```

6.  **Run**: Click the "Run" icon on the transformation node.
7.  **Export**: Right-click the result and select **Export File** to save it to your disk.

## Commands

| Command | Description |
|Str|Str|
| `JScratch: New Session` | Create a new, empty scratchpad session. |
| `JScratch: Create Input` | Add a new root file to the pipeline. |
| `JScratch: Add Transformation` | Attach a processing script to a node. |
| `JScratch: Run Transformation` | Execute the script and generate output. |
| `JScratch: Export File` | Save a virtual file to your local filesystem. |
| `JScratch: Clear History` | Delete all saved sessions. |

## Requirements

- Visual Studio Code 1.85.0 or newer.

## Release Notes

### 0.0.1

- Initial release of JScratch.
- Virtual File System implementation.
- Basic Pipeline and History management.
