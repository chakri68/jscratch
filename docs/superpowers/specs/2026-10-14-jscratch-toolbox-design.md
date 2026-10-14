# JScratch 0.1 — ETL scratchpad + dev toolbox

**Status:** draft, awaiting review
**Date:** 2026-10-14

## Why

JScratch is a decent ETL scratchpad wearing a rough UI: the pipeline renders flat, a stray `console.log` corrupts outputs, and the icons are a 3072×2048 PNG that shrinks to a smudge. Meanwhile the stuff I actually reach for between transforms — base64, JWT decode, JSON→YAML, a UUID — lives in five browser tabs. This release fixes the ETL flow and pulls those utilities into the same sidebar, PowerToys-style. ETL stays the headline.

## Goals

1. ETL pipeline that reads as a pipeline: nested, stateful, debuggable.
2. A searchable toolbox of local, offline dev utilities in one webview dashboard.
3. Assets that look intentional at every size and in every theme.
4. Adding a new tool = adding one file.

## Non-goals

- Visual node-graph canvas, multi-input joins.
- Renaming the extension or changing its ID (`chakri68.jscratch` stays; installs keep updating).
- Sandboxing transforms. They're the user's own code with full Node access, same as today.
- Anything that talks to the network.

## Architecture

One extension, three feature areas sharing a tiny webview layer. Everything that doesn't need `vscode` is a plain module so it's testable in bare Node.

```
src/
  extension.ts                 wiring only: registers providers, commands, panels
  etl/
    fileSystemProvider.ts      (existing, moved) datalab:// FS
    sessionManager.ts          (existing, moved) + node status, globalState persistence
    commands.ts                pipeline commands pulled out of extension.ts
    pipelineTree.ts            nested tree + drag-and-drop
    historyTree.ts             (existing, moved)
    statusDecorations.ts       FileDecorationProvider: ran / stale / failed badges
    codeLens.ts                (existing, moved) + "Preview input" lens
    executor.ts                vscode glue: progress, output channel, node bookkeeping
    runner.ts                  [pure] materialize → bundle → spawn → collect result + logs
    formats.ts                 [pure] parse/serialize json | csv | ndjson | txt
    typeInference.ts           [pure] inferType (deduped from extension.ts)
    templates.ts               [pure] transform template + TYPE DEFS block rewrite
  tools/
    types.ts                   [pure] Tool interface
    registry.ts                [pure] all tools, lookup, search, safe run wrapper
    encode/  base64.ts url.ts html.ts hex.ts jwt.ts
    convert/ json.ts yaml.ts csv.ts toml.ts tsTypes.ts
    generate/ uuid.ts timestamp.ts hash.ts lorem.ts random.ts
    inspect/ regex.ts jsonpath.ts diff.ts cron.ts
  toolbox/
    toolboxPanel.ts            singleton webview panel, host side of messaging
    toolboxTree.ts             sidebar category → tool tree
    launcher.ts                Ctrl+Alt+J quick pick
    editorActions.ts           "JScratch ›" editor context submenu (quick actions)
  preview/
    previewPanel.ts            data preview webview, host side
  webview/
    html.ts                    CSP + nonce + asset URIs, shared by both panels
    toolbox.ts                 browser bundle
    preview.ts                 browser bundle
    styles.css                 theme-variable based styles
```

`esbuild.js` gains two browser-platform entries (`webview/toolbox.ts`, `webview/preview.ts` → `out/webview/*.js`) next to the existing node entry.

### Runtime dependencies (all bundled by esbuild except esbuild itself)

| Package | Why not hand-roll |
|---|---|
| `papaparse` | CSV quoting/escaping is a bug farm |
| `yaml` | spec-compliant YAML 1.2 |
| `smol-toml` | small, spec-compliant TOML |
| `jsonpath-plus` | JSONPath query tool |
| `cronstrue` | cron → English |
| `@vscode-elements/elements` | theme-native web components for webviews (the Microsoft toolkit was deprecated Jan 2025) |
| `@vscode/codicons` | icons inside webviews |

Hashes, UUIDs, base64, hex, JWT decoding use Node's `crypto` / `Buffer`. No other deps.

## 1. ETL pipeline

### Tree

- Real hierarchy from `parentId`: input → transform → output → transform → …
- A node may have **multiple** transforms (branching). "Add Transform" always creates a new one; it no longer silently reopens the existing one.
- Custom SVG icons per node type (light/dark variants). Run status shown via a `FileDecorationProvider` on the node's `datalab://` URI: ✓ (ran, green `testing.iconPassed`), ! (failed, `testing.iconFailed`), • (stale, `editorWarning.foreground`). Decorations also appear on editor tabs for free.
- `description` shows a hint: row count for outputs, `1.2s` last duration for transforms.
- Inline actions: input/output → *Add Transform*, *Preview*, *Export*; transform → *Run*, *Run Branch*, *Reload Types*, *Delete*.
- Drag-and-drop: files from the OS/explorer dropped on the tree become inputs (`TreeDragAndDropController`, `text/uri-list`).
- `viewsWelcome` when no session: **New Session** button, plus a line pointing at the toolbox. When a session is empty: **Add Input** button.
- The view title shows the session name; the old "Active Session: X" label hack goes away.

### Node model (pipeline.json)

```ts
interface PipelineNode {
  id: string;
  type: "input" | "transform" | "output";
  label: string;
  filename: string;
  parentId?: string;
  outputFormat?: "json" | "csv" | "ndjson" | "txt"; // transform only, default json
  lastRun?: { at: number; ok: boolean; durationMs: number; error?: string };
}
```

All new fields are optional, so existing sessions load unchanged. **Stale** = the transform's `lastRun.at` is older than the `mtime` of its own file or its parent's file (read via `stat`).

### Adding inputs

*Add Input* opens a quick pick:
- **Empty file…** → name prompt (today's behaviour)
- **From clipboard** → name prompt prefilled with a guessed extension (JSON parse ok → `.json`, comma-heavy lines → `.csv`, else `.txt`)
- **From file…** → open dialog, copied into the session
- **From active editor** → selection, or the whole document if nothing is selected

### Transforms

- Name prompt prefilled with `transform-N.ts`. Output file is `<name>.out.<ext>`.
- The template (from `templates.ts`) keeps today's shape: global `input: { raw, data }` plus `export function transform()`. The README gets fixed to match it. The template's header comment notes that `console.log` is fine now and goes to the JScratch output channel.
- *Set Output Format* (context menu) changes `outputFormat`; the next run serializes accordingly.

### Execution (`runner.ts` + `executor.ts`)

The current bug: result and logs share stdout. New flow:

1. **Host** parses the parent file with `formats.parse(filename, raw)` (CSV: papaparse with `header: true, dynamicTyping: true, skipEmptyLines: true`, so `data` is an array of objects keyed by the first row and the type inference gets real field names. This replaces today's `string[][]`, and the template's TYPE DEFS change to match. NDJSON: one `JSON.parse` per non-empty line. JSON. TXT: lines) and writes `input.json` = `{ raw, data }` into a temp dir. Parsing lives in the host so the user bundle never has to resolve papaparse from the temp dir.
2. The wrapper reads `input.json`, sets `global.input`, awaits `transform()`, and writes the result to `result.json` (path from `argv`). It never touches stdout.
3. esbuild bundles wrapper + user script. On failure, esbuild's formatted messages go to the output channel and the node is marked failed.
4. Spawn `process.execPath` with `ELECTRON_RUN_AS_NODE=1`. Stream stdout/stderr live to the **JScratch** output channel, prefixed `[transform-1.ts]`. Timeout from `jscratch.pipeline.timeoutMs` (default 60000); progress is cancellable.
5. On exit 0: host reads `result.json`, serializes with `formats.serialize(outputFormat, value)`, writes/updates the output node, records `lastRun`, and opens the output beside the editor (`preserveFocus: true`).
6. On failure: record `lastRun.ok = false` with the first line of the error, and show a toast with **Show Log** and **Open Script** buttons.

`runner.ts` takes plain paths and returns `{ ok, resultPath?, logs, error?, durationMs }`, so it's testable without VS Code.

**Run Branch:** runs the transform, then every descendant transform in breadth-first order, stopping at the first failure.

**Run on save:** setting `jscratch.pipeline.runOnSave` (default `false`). Saving a `datalab://` transform runs it.

### Persistence

The active session id lives in `context.globalState` and is restored on activation. If that session was deleted, it falls back to none.

## 2. Toolbox

### Tool contract

```ts
type Category = "encode" | "convert" | "generate" | "inspect";

interface ToolField { id: string; label: string; multiline?: boolean; placeholder?: string }
interface ToolOption {
  id: string; label: string;
  kind: "select" | "checkbox" | "number" | "text";
  choices?: string[]; default: string | number | boolean;
}

interface Tool {
  id: string;                 // "base64"
  title: string;              // "Base64"
  category: Category;
  icon: string;               // codicon name
  keywords?: string[];        // for search: ["b64", "atob"]
  fields: ToolField[];        // [] for pure generators
  options?: ToolOption[];     // e.g. mode: encode|decode, urlSafe
  outputLanguage?: string;    // syntax hint for "open in editor"
  quickActions?: { label: string; options: Record<string, unknown> }[]; // editor submenu entries
  run(fields: Record<string, string>, options: Record<string, unknown>): ToolResult;
}

type ToolResult =
  | { ok: true; output: string; meta?: string; data?: unknown } // meta: "3 matches"; data: structured payload, e.g. regex ranges
  | { ok: false; error: string };
```

`registry.run(id, fields, options)` wraps every call in try/catch, so a thrown exception becomes `{ ok: false }`. Tools are synchronous and pure (generators read randomness/time, which is fine).

### Tool list (v0.1)

| Category | Tool | Notes |
|---|---|---|
| Encode | Base64 | encode/decode, URL-safe toggle |
| | URL | encode/decode, component vs full URI |
| | HTML entities | encode/decode |
| | Hex | text ⇄ hex |
| | JWT | decode header + payload, `exp`/`iat` as human dates in `meta`; no signature verification, and the UI says so |
| Convert | JSON format | pretty (indent option) / minify / sort keys |
| | JSON ⇄ YAML | direction option |
| | JSON ⇄ CSV | via papaparse; arrays of objects ⇄ header rows |
| | JSON ⇄ TOML | direction option |
| | JSON → TS types | reuses `etl/typeInference.ts` |
| Generate | UUID | v4 / v7, count |
| | Timestamp | epoch s/ms ⇄ ISO/local; empty input = now |
| | Hash | md5 / sha1 / sha256 / sha512, hex/base64 |
| | Lorem ipsum | words/sentences/paragraphs, count |
| | Random string | length, charset toggles |
| Inspect | Regex tester | fields: pattern, flags, text; output lists matches + groups; matches highlighted in webview |
| | JSONPath | fields: json, path |
| | Text diff | fields: left, right; **Open Diff** opens VS Code's native diff editor on two virtual docs |
| | Cron explain | expression → English (cronstrue) + next 5 run times |

### Dashboard webview (`toolboxPanel.ts` + `webview/toolbox.ts`)

Layout: a left rail with search plus tools grouped by category; on the right, the selected tool's fields, options and output. On narrow panels the rail collapses into a top dropdown.

- Built with `@vscode-elements/elements` (`vscode-textfield`, `vscode-textarea`, `vscode-single-select`, `vscode-checkbox`, `vscode-button`). Colours come only from `--vscode-*` CSS variables, so every theme works without extra code.
- **Live run:** a field or option change posts `{ type: "run", toolId, fields, options }` after a 150 ms debounce. The host replies `{ type: "result", ... }`. Tools run in the extension host, because some need Node `crypto`.
- **Output actions:** Copy · Insert at cursor (last active text editor) · Open in editor (untitled doc with `outputLanguage`) · **Send to Pipeline**, which creates an input node in the active session from the output. That's the bridge into ETL.
- **Input helpers:** "Use selection" and "Paste" buttons on the first field.
- State (selected tool, last field values per tool) is kept with `vscode.setState` and survives the panel being hidden. The last used tool is also stored in `globalState`.
- Singleton panel. Opening it again just reveals it and focuses the requested tool.
- CSP: `default-src 'none'`, scripts by nonce, styles/fonts from `webview.cspSource`. `localResourceRoots` = `out/webview`, `media`, the codicons dist.

### Other entry points (all fed by the registry)

- **Toolbox sidebar view:** categories → tools with codicons. Clicking opens the dashboard on that tool.
- **Launcher** (`jscratch.openTool`, `Ctrl+Alt+J` / `Cmd+Alt+J`): a quick pick with category separators, matching on title and keywords. Opens the dashboard prefilled with the current selection.
- **Editor submenu** "JScratch ›" in the editor context menu (only when there's a selection): each tool's `quickActions`, e.g. *Base64 Decode*, *URL Encode*, *Format JSON*, *JSON → YAML*, *Decode JWT*. Runs on the selection and replaces it in place. JWT is the exception and opens its result in a new tab. Errors become a toast; the text stays untouched.

## 3. Data preview (`previewPanel.ts` + `webview/preview.ts`)

- Opened from *Preview* on any input/output node, or the CodeLens/editor title button on `datalab://` data files.
- The host parses with `formats.parse` and sends `{ columns, rows (first jscratch.preview.maxRows, default 1000), totalRows, schema }`. `schema` = per-column inferred type (number / string / boolean / null / mixed) plus null count.
- Tabular = array of objects (columns = union of keys) or array of arrays (CSV). Anything else shows "Not tabular", the top-level type/keys, and an *Open as text* button.
- Client-side: click a header to sort, a filter box for substring match over the loaded rows, and a sticky header. A footer reads `showing 1000 of 48,213 rows · 7 columns`.
- Auto-refreshes when the underlying `datalab://` file changes (FS provider `onDidChangeFile`), so it updates after each run.
- One panel per file, reused when reopened.

## 4. Assets

All hand-authored SVG in `media/`:

- `icon.svg` → `icon.png` at 256×256: the existing yellow `{ / }` scratch mark, redrawn as clean vector paths, centered on a dark rounded-square tile (`#1e1e1e`, 12% corner radius) with ~18% padding. Readable on light and dark marketplace backgrounds. The PNG is exported once with a dev script (`scripts/render-icon.mjs` using `@resvg/resvg-js` as a devDependency) and committed.
- `activity.svg`: single-colour (`currentColor`) 24×24 version of the mark for the activity bar.
- `nodes/{input,transform,output}.svg` (+ `-dark` variants): 16×16. Input = document with a down-arrow tab, transform = ƒ in a rounded square, output = document with an up-arrow tab. They share stroke weight with codicons (1px at 16px) so they don't look foreign next to them.
- `full.png` for the README is regenerated from the same vector mark plus wordmark, transparent background, cropped tight.
- Toolbox categories use codicons (`symbol-key`, `arrow-swap`, `sparkle`, `search`) so they match VS Code's own iconography.

## 5. Settings

| Key | Default | |
|---|---|---|
| `jscratch.pipeline.runOnSave` | `false` | run transform on save |
| `jscratch.pipeline.timeoutMs` | `60000` | kill a transform after this |
| `jscratch.pipeline.defaultOutputFormat` | `"json"` | for new transforms |
| `jscratch.preview.maxRows` | `1000` | rows sent to preview |

## 6. Commands & menus hygiene

- Every command gets `"category": "JScratch"` and a codicon. Context-only commands (delete node, reload types, …) are hidden from the palette via `menus.commandPalette` + `when: false`.
- Palette-visible: New Session, Add Input, Open Toolbox, Open Tool… (launcher), Run Current Transform, Preview Current File, Clear History.
- `activationEvents` stays empty beyond `onFileSystem:datalab`. Contributed views and commands activate implicitly on VS Code ≥1.74, and the engine floor is 1.85.

## Error handling summary

| Where | Behaviour |
|---|---|
| Tool throws | registry → `{ ok:false, error }` → shown inline under the output, styled with `--vscode-inputValidation-errorBorder` |
| Quick action fails | toast; selection untouched |
| Input parse fails (e.g. bad JSON) | `data` falls back to `raw` string (today's behaviour), and a warning is logged to the output channel |
| Bundle/compile fails | esbuild messages → output channel; node marked failed; toast with Show Log |
| Transform throws / non-zero exit / timeout | stderr → output channel; `lastRun.error`; toast with Show Log / Open Script |
| Result not serializable to chosen format | error naming the format and the offending shape, e.g. "CSV needs an array of objects or arrays" |
| Webview ↔ host message for unknown tool | ignored, logged |

## Testing

- **Unit (no VS Code):** `node --test` via `tsx` (`npm run test:unit`) over `tools/**`, `etl/formats.ts`, `etl/typeInference.ts`, `etl/templates.ts`, `etl/runner.ts`. Each tool gets round-trip and error-path tests. The runner tests cover: console.log not leaking into the result, thrown errors, timeout, async transforms, CSV with quoted commas.
- **Integration (`@vscode/test-electron`, existing harness):** activation, session create/restore, add input → transform → run → output node + status, preview panel opens.
- **Manual pass** (in the plan): light theme, dark theme, high-contrast; narrow sidebar; a 50k-row CSV preview.
- `npm run lint` clean.

## Migration / release

- Version 0.1.0. Existing sessions load unchanged. Old `output-<ts>.json` outputs keep their names, and only new outputs use `<name>.out.<ext>`.
- Move the existing src files into `etl/` without behaviour changes first, so the diff stays reviewable.
- README rewritten: what it is, ETL walkthrough (matching the real template), toolbox table, settings, screenshots.
- CHANGELOG.md is introduced, and the release notes move there out of the README.

## Open questions

None blocking. Candidates for 0.2: more tools (Unicode inspector, colour converter, number base converter), a JSON tree view in the preview, multi-input transforms.
