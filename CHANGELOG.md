# Changelog

## 0.1.0

the ETL flow got fixed up, and a toolbox moved in next door.

### ⚠️ Breaking: CSV inputs are objects now

CSV inputs now parse to an array of objects keyed by the header row, with `dynamicTyping` on (numbers and booleans come through typed). they used to be `string[][]`. any transform that indexes `row[0]` needs to switch to `row.<column>`:

```ts
// before
return input.data.map((row) => row[0]);
// after
return input.data.map((row) => row.name);
```

hit **Reload Types** on old transforms so the `TYPE DEFS` block picks up the real column names.

### Added

- **Toolbox:** 19 offline tools in a webview dashboard. Encode: Base64, URL, HTML entities, Hex, JWT. Convert: JSON Format, JSON ⇄ YAML, JSON ⇄ CSV, JSON ⇄ TOML, JSON → TS Types. Generate: UUID, Timestamp, Hash, Lorem Ipsum, Random String. Inspect: Regex Tester, JSONPath, Text Diff, Cron Explain.
- toolbox output actions: Copy, Insert, Open in Editor, and Send to Pipeline (turns the output into a session input).
- Toolbox sidebar view, grouped by category.
- launcher: `JScratch: Open Tool…` on `Ctrl+Alt+J` / `Cmd+Alt+J`.
- **JScratch ›** editor context submenu with quick actions on the selection: Base64 Encode/Decode, URL Encode/Decode, Format JSON, Minify JSON, JSON → YAML, Decode JWT.
- **Data preview:** a sortable, filterable table for JSON, CSV and NDJSON files, with per-column types and null counts. refreshes when the file changes. opens from tree nodes, the editor title bar and a **Preview Input** CodeLens.
- Add Input sources: empty file, clipboard, file from disk, active editor. files dragged onto the tree become inputs.
- branching: a node can have several transforms.
- run status badges on nodes and editor tabs (ran, failed, stale), plus row counts and last run duration in the tree.
- **Run Branch:** runs a transform and everything downstream, stopping at the first failure.
- **Set Output Format** per transform: json, csv, ndjson or txt.
- **Reload Types:** regenerates a transform's `TYPE DEFS` block from its current input.
- run toasts with **Show Log** and **Open Script** on failure.
- settings: `jscratch.pipeline.runOnSave`, `jscratch.pipeline.timeoutMs`, `jscratch.pipeline.defaultOutputFormat`, `jscratch.preview.maxRows`.
- welcome views for "no session" and "empty session".

### Changed

- **CSV parsing** (see the breaking note above).
- the pipeline renders as a real nested tree instead of a flat list.
- transforms run in a separate Node process (VS Code's own binary) with a configurable timeout. logs stream live to the **JScratch** output channel, prefixed with the script name.
- **Add Transform** always creates a new transform instead of reopening the existing one. the name prompt is prefilled with `transform-N.ts`.
- new outputs are named `<transform>.out.<ext>`. old `output-<ts>.json` files keep their names.
- outputs open beside the editor without stealing focus.
- the transform template notes that `console.log` is safe.
- every command sits under the **JScratch** category, and context-only commands are hidden from the palette.
- redrawn icon set: marketplace icon, activity bar icon, per-node tree icons.
- the README's ETL example now matches the real template (`export function transform()`, no `export default`).

### Fixed

- `console.log` in a transform no longer corrupts the output file. results go through a separate file, so stdout is just logs.
- cancelling a run works at any point, including while the script is still bundling.
- the active session persists across VS Code restarts.

## 0.0.4

- Fixed docs typos and improved formatting.

## 0.0.3

- Moved to bundling ESBuild with the extension to avoid VSCode restrictions.
- Improved error handling in transformation scripts.

## 0.0.2

- Moved to using tsx from user's global installation
- Broken because of VSCode restrictions now - PLEASE MOVE TO 0.0.3

## 0.0.1

- Initial release of JScratch.
- Virtual File System implementation.
- Basic Pipeline and History management.
