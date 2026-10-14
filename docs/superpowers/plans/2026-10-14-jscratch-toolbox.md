# JScratch 0.1 Toolbox Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn JScratch into an ETL scratchpad with a nested, stateful pipeline, plus a webview dev toolbox (19 tools) and a data preview, with redrawn assets.

**Architecture:** Pure, vscode-free modules (`etl/formats`, `etl/runner`, `etl/typeInference`, `etl/templates`, `etl/status`, `etl/names`, `tools/**`) carry the logic and get unit tests under `node --test`. Thin vscode glue (`extension.ts`, tree providers, panels, executor) wires them in. Two browser bundles (`webview/toolbox.ts`, `webview/preview.ts`) talk to host-side panels over `postMessage`.

**Tech Stack:** TypeScript 5, esbuild 0.27, VS Code API ≥1.85, papaparse, yaml, smol-toml, jsonpath-plus, cronstrue, @vscode-elements/elements, @vscode/codicons, tsx (tests), @resvg/resvg-js (icon export, dev only).

**Spec:** `docs/superpowers/specs/2026-10-14-jscratch-toolbox-design.md`. Read it before starting any task. Section numbers below refer to it.

## Global Constraints

- Package manager: **npm** (CI runs `npm ci`; `package-lock.json` is the lockfile). Replace `pnpm run` in `scripts.pretest` with `npm run`.
- `engines.vscode` stays `^1.85.0`. Extension ID `chakri68.jscratch` unchanged.
- Bundled libraries (papaparse, yaml, smol-toml, jsonpath-plus, cronstrue, @vscode-elements/elements, @vscode/codicons) go in **devDependencies**, so vsce doesn't ship their node_modules. `esbuild` stays in **dependencies** (external, native binary, used at runtime).
- No network access anywhere.
- Every contributed command has `"category": "JScratch"`.
- Webview colours come only from `--vscode-*` CSS variables.
- Pure modules must not import `vscode`. `npm run test:unit` must run without VS Code.
- Work on branch `feat/toolbox-0.1`. **Merging to master releases**, because the workflow triggers on `package.json` changes. Bump the version to `0.1.0` only in the final task.
- Commit after every task with a conventional-commit message.

## Review Focus

1. **Large input in the toolbox:** a multi-MB paste into a live-running tool blocks the extension host, because tools run synchronously there. Expected: `registry.run` refuses any field over 5 MB with `Input too large (max 5 MB)`. Test in Task 8.
2. **Transform returns `undefined`, a circular object, or a BigInt.** Expected: a clear failure, not an empty or garbage output file. `undefined` → `transform() returned undefined — did you forget to return?`. Circular/BigInt → the error message names the serialization problem. Test in Task 3.
3. **Windows line endings (`\r\n`) in TXT/CSV/NDJSON inputs.** Expected: no trailing `\r` in lines or values. Test in Task 2.
4. **Duplicate or invalid file names** when adding inputs/transforms (`data.json` twice, `a/b.json`, empty). Expected: the input box rejects them via `validateInput` with a message. Test in Task 4.
5. **Restored webview state that references a tool which no longer exists** (renamed id after an upgrade). Expected: the dashboard falls back to the first tool instead of rendering blank. Test in Task 8 (`resolveTool`).

---

### Task 1: Branch, tooling, and moving files into `etl/`

**Files:**
- Move: `src/{fileSystemProvider,sessionManager,executor,codeLensProvider,treeDataProvider,historyDataProvider}.ts` → `src/etl/{fileSystemProvider,sessionManager,executor,codeLens,pipelineTree,historyTree}.ts`
- Create: `src/etl/typeInference.ts`, `src/etl/templates.ts`, `.eslintrc.json`, `test/unit/typeInference.test.ts`, `test/unit/templates.test.ts`
- Modify: `src/extension.ts`, `package.json`, `tsconfig.json`

**Interfaces:**
- Produces: `inferType(value: unknown, indent?: string): string` (exact current behaviour, moved). `transformTemplate(typeDef: string): string` (current template text). `replaceTypeDefs(source: string, typeDef: string): string | undefined` (returns `undefined` when no `/* TYPE DEFS START */…END */` block is found). `typeDefForFile(filename: string, raw: string): string` (current json/csv/txt branching, extracted from the two copies in `extension.ts`).

- [ ] **Step 1:** `git checkout -b feat/toolbox-0.1 && npm install`
- [ ] **Step 2:** Add devDeps `tsx`, then `"test:unit": "tsx --test test/unit/**/*.test.ts"`. Add a minimal `.eslintrc.json` (`@typescript-eslint/recommended`, `parser: @typescript-eslint/parser`). The lint script currently references a config that doesn't exist. Remove `rootDir` from tsconfig (tests live outside `src`) and add `"include": ["src", "test"]`.
- [ ] **Step 3: Write failing tests**
  - `inferType({a: 1, "b-c": [true]})` contains `a: number;` and `"b-c": boolean[];`
  - `inferType([])` === `"any[]"`, `inferType(null)` === `"any"`
  - `typeDefForFile("x.json", "not json")` === `"any"`; `typeDefForFile("x.txt", "a\nb")` === `"string[]"`
  - `replaceTypeDefs(transformTemplate("any"), "number")` contains `data: number;` and is otherwise identical outside the block
  - `replaceTypeDefs("no block", "x")` === `undefined`
- [ ] **Step 4:** `npm run test:unit`. Expected: FAIL (modules missing).
- [ ] **Step 5:** Move the files with `git mv`, extract the three functions, and make `extension.ts` call them. No behaviour change.
- [ ] **Step 6:** `npm run test:unit && npm run compile && npm run lint`. Expected: all pass. Press F5 and smoke-test new session → input → transform → run.
- [ ] **Step 7:** Commit `refactor: move ETL into src/etl and extract pure helpers`

### Task 2: `etl/formats.ts`

**Files:** Create `src/etl/formats.ts`, `test/unit/formats.test.ts`. Add devDep `papaparse`, `@types/papaparse`.

**Interfaces:**
- Produces:
  - `type DataFormat = "json" | "csv" | "ndjson" | "txt"`
  - `formatFromFilename(name: string): DataFormat | undefined` (by extension; `.jsonl` → ndjson)
  - `parse(filename: string, raw: string): { data: unknown; warning?: string }`. On parse failure: `data = raw` with a `warning`.
  - `serialize(format: DataFormat, value: unknown): string`. Throws `Error` with the spec §Error-handling wording for unserializable shapes.
  - `guessFormat(text: string): DataFormat` (for clipboard inputs: JSON-parseable → json; ≥2 lines where most lines contain a comma → csv; else txt).
  - `tabulate(data: unknown): { columns: string[]; rows: unknown[][] } | undefined` (array of objects → union of keys in first-seen order; array of arrays → columns `"1".."n"`; else undefined).

- [ ] **Step 1: Write failing tests**
  - CSV `'name,note\n"Smith, J","a ""q"""\n'` → `[{name: "Smith, J", note: 'a "q"'}]`
  - CSV `"n\r\n1\r\n2\r\n"` → `[{n: 1}, {n: 2}]` (dynamicTyping, no `\r`)
  - TXT `"a\r\nb"` → `["a", "b"]`; NDJSON `'{"a":1}\r\n\r\n{"a":2}'` → `[{a:1},{a:2}]`
  - bad JSON → `data === raw` and `warning` matches `/JSON/`
  - `serialize("csv", [{a:1,b:"x,y"}])` === `'a,b\r\n1,"x,y"'` (papaparse unparse default newline)
  - `serialize("csv", 5)` throws `/CSV needs an array of objects or arrays/`
  - `serialize("ndjson", [{a:1},{a:2}])` === `'{"a":1}\n{"a":2}'`; `serialize("ndjson", {})` throws `/NDJSON needs an array/`
  - `serialize("txt", ["a","b"])` === `"a\nb"`; `serialize("txt", {a:1})` === pretty JSON
  - `serialize("json", x)` === `JSON.stringify(x, null, 2)`
  - `tabulate([{a:1},{b:2}])` → columns `["a","b"]`, rows `[[1,undefined],[undefined,2]]`; `tabulate({})` → undefined
  - `guessFormat('{"a":1}')` json, `guessFormat("a,b\n1,2")` csv, `guessFormat("hello")` txt
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. CSV parse options are exactly `{ header: true, dynamicTyping: true, skipEmptyLines: true }`. Strip `\r` from line splits.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Update `typeDefForFile` (Task 1) to infer from `parse(...).data` for csv/ndjson too, so CSV gets object types. Adjust its test: `typeDefForFile("x.csv", "a\n1")` contains `a: number;`. Run, then commit `feat(etl): format parsing and serialization`.

### Task 3: `etl/runner.ts`

**Files:** Create `src/etl/runner.ts`, `src/etl/wrapper.ts` (wrapper source as an exported string constant), `test/unit/runner.test.ts`.

**Interfaces:**
- Consumes: `parse` (Task 2).
- Produces:
  ```ts
  interface RunRequest { scriptSource: string; inputFilename: string; inputRaw: string;
    timeoutMs: number; onLog?: (line: string, stream: "stdout" | "stderr") => void;
    signal?: AbortSignal; nodePath?: string /* default process.execPath */ }
  interface RunResult { ok: boolean; value?: unknown; error?: string; durationMs: number; parseWarning?: string }
  function runTransform(req: RunRequest): Promise<RunResult>
  ```
  Flow per spec §1 Execution: temp dir → `input.json` `{raw,data}` → wrapper + `userTransform.ts` → esbuild (`bundle, platform: "node", format: "cjs"`) → spawn `nodePath` with env `ELECTRON_RUN_AS_NODE=1` and args `[out.js, input.json, result.json]` → read `result.json`. The temp dir is always removed. The wrapper writes `result.json` as `{"ok":true,"value":…}` or `{"ok":false,"error":…}`. Build errors are joined from esbuild's `formatMessages` into `error`.

- [ ] **Step 1: Write failing tests** (each builds a real script string)
  - `console.log("noise"); return input.data.length` with `[1,2,3]` input → `ok`, `value === 3`, `onLog` got `"noise"`
  - async `transform` returning after `await new Promise(r => setTimeout(r, 10))` → ok
  - `throw new Error("boom")` → `!ok`, `error` matches `/boom/`
  - `while(true){}` with `timeoutMs: 500` → `!ok`, `error` matches `/timed out after 500ms/`
  - returns `undefined` → `error === "transform() returned undefined — did you forget to return?"`
  - returns circular object → `error` matches `/circular/i`; returns `10n` → `error` matches `/BigInt/`
  - syntax error in script → `!ok`, `error` matches `/userTransform\.ts/`
  - CSV input with a quoted comma → `input.data[0].name === "Smith, J"` (proves host-side parsing)
  - aborting `signal` → `error === "Cancelled"`
  - temp dirs matching `jscratch-*` don't grow in count across the test run
- [ ] **Step 2:** Run. Expected: FAIL.
- [ ] **Step 3:** Implement. The undefined/circular/BigInt checks live in the wrapper, around `JSON.stringify`.
- [ ] **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(etl): isolated transform runner with log/result separation`

### Task 4: Node model, status, names, session persistence

**Files:** Create `src/etl/status.ts`, `src/etl/names.ts`, `test/unit/status.test.ts`, `test/unit/names.test.ts`. Modify `src/etl/sessionManager.ts`.

**Interfaces:**
- Produces:
  - `PipelineNode` gains `outputFormat?: DataFormat` and `lastRun?: { at: number; ok: boolean; durationMs: number; error?: string }` (spec §1 Node model).
  - `type NodeStatus = "never" | "ok" | "failed" | "stale"`; `nodeStatus(node: PipelineNode, selfMtime: number, parentMtime: number): NodeStatus`. Only transforms are non-`never`. Stale = `lastRun.at < max(selfMtime, parentMtime)`, and stale wins over ok/failed.
  - `validateFileName(name: string, existing: string[]): string | undefined` returns an error message or undefined. Rejects empty/whitespace, `/` or `\`, `pipeline.json`, and duplicates (case-sensitive).
  - `nextTransformName(existing: string[]): string` → `transform-N.ts`, with N = 1 + highest existing N.
  - `outputFilenameFor(transformFilename: string, format: DataFormat): string` → `transform-1.out.json`.
  - `SessionManager` constructor gains `memento: vscode.Memento`. `restore(): Promise<void>` reads key `jscratch.activeSessionId` and falls back to undefined if that session dir is missing. `setSession`/`createSession`/`deleteSession` write the key. New `updateNode(sessionId, id, patch: Partial<PipelineNode>)`, `children(sessionId, id): Promise<PipelineNode[]>`.
- [ ] **Step 1: Write failing tests** covering every bullet above, including: `validateFileName("data.json", ["data.json"])` → `/already exists/`; `validateFileName("a/b.json", [])` → `/slash/`; `nextTransformName(["transform-1.ts","transform-7.ts"])` → `"transform-8.ts"`; `nodeStatus` for each of the 4 states.
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Wire `restore()` into `activate` (pass `context.globalState`). F5: create a session, reload the window, and the session should still be active. Commit `feat(etl): node status, name validation, session persistence`.

### Task 5: Executor rewrite + output channel + run modes + settings

**Files:** Modify `src/etl/executor.ts`, `src/extension.ts`, `package.json` (`contributes.configuration`). Create `src/etl/commands.ts` (move all pipeline command registrations here from `extension.ts`: `registerPipelineCommands(ctx, deps)`).

**Interfaces:**
- Consumes: `runTransform` (T3), `serialize`, `formatFromFilename` (T2), `outputFilenameFor`, `updateNode` (T4).
- Produces: `Executor.run(node: PipelineNode): Promise<boolean>`, `Executor.runBranch(node): Promise<void>` (BFS through descendant transforms, stops on the first `false`), the `OutputChannel` named `"JScratch"` exported as `log` from `src/log.ts`, and commands `jscratch.runTransform`, `jscratch.runBranch`, `jscratch.setOutputFormat`.

- [ ] **Step 1:** Add the four settings from spec §5 with exact keys, defaults and descriptions.
- [ ] **Step 2:** Implement `run`: read the parent + script → `runTransform` with `withProgress` (Notification, cancellable → AbortController). Logs go to the channel prefixed `[<filename>] `. On ok: `serialize(node.outputFormat ?? setting)`, and a serialize error counts as a failure. Write or create the output node (`outputFilenameFor`). If an existing output node's extension differs from the format, rename its file and update `filename`/`label`. If `RunResult.parseWarning` is set, log it to the channel as `[<filename>] warning: <text>`. Then `updateNode(... lastRun)` and open the output `ViewColumn.Beside, preserveFocus: true`. On failure: `lastRun.ok=false, error=first line`, and show the toast `Transform failed: <first line>` with buttons `Show Log` (→ `log.show(true)`) and `Open Script`.
- [ ] **Step 3:** `jscratch.setOutputFormat` = a quick pick of the 4 formats, saved via `updateNode`.
- [ ] **Step 4:** Run-on-save: `workspace.onDidSaveTextDocument`, gated on scheme `datalab`, `.ts`, the setting, and the node being a transform.
- [ ] **Step 5:** Delete the old addTransform "reuse existing" branch, so every Add Transform creates a new one named `nextTransformName`, with the name prompt prefilled and validated by `validateFileName`. The template header comment from spec §1 is updated in `templates.ts`.
- [ ] **Step 6:** `npm run compile && npm run test:unit`. Then F5 manual check: a transform with `console.log` → logs in the "JScratch" channel, clean output; a throwing transform → toast with both buttons; switching to CSV renames the output to `.out.csv`; run-on-save works when enabled. Commit `feat(etl): executor with output channel, output formats, run branch, run on save`.

### Task 6: Assets

**Files:** Create `media/icon.svg`, `media/activity.svg`, `media/nodes/{input,transform,output}{,-dark}.svg`, `media/full.svg`, `scripts/render-icon.mjs`. Overwrite `media/icon.png`, `media/full.png`. Delete `media/icon_square.png` if nothing references it (`git grep icon_square`). Add devDep `@resvg/resvg-js`.

- [ ] **Step 1:** Trace the `{ / }` mark from `media/full.png` as vector paths in `icon.svg`, following spec §4 exactly: viewBox `0 0 256 256`, tile `#1e1e1e` with `rx` ≈ 31 (12%), mark ≈ 164px (18% padding each side), mark colour `#FFCE00`.
- [ ] **Step 2:** `activity.svg`: 24×24, mark only, `fill="currentColor"`. Node icons: 16×16, `stroke-width="1"`, light variants stroke `#424242`, dark `#C5C5C5`. Shapes as spec §4.
- [ ] **Step 3:** `scripts/render-icon.mjs` renders `icon.svg` → `icon.png` (256px) and `full.svg` → `full.png` (1280px wide, transparent). Add script `"icons": "node scripts/render-icon.mjs"`. Run it, then view both PNGs and check that the mark reads at 32px (downscale the PNG and view it).
- [ ] **Step 4:** `package.json`: `viewsContainers.activitybar[0].icon` → `media/activity.svg`. Commit `feat: redrawn icon set`.

### Task 7: Pipeline tree, decorations, inputs, welcome, menus

**Files:** Modify `src/etl/pipelineTree.ts`, `src/etl/commands.ts`, `package.json`. Create `src/etl/statusDecorations.ts`.

**Interfaces:**
- Consumes: `nodeStatus` (T4), `guessFormat` (T2), `validateFileName` (T4), node SVGs (T6).
- Produces: `PipelineTreeDataProvider` implementing `TreeDragAndDropController` (`dropMimeTypes: ["text/uri-list"]`). `StatusDecorationProvider implements FileDecorationProvider` with `refresh(uris: Uri[])`. Command `jscratch.addInput` (replaces `createInput`; keep `createInput` registered as an alias so old keybindings work).

- [ ] **Step 1:** `getChildren(el)` = nodes whose `parentId === el?.id` (roots = no parentId). Collapsible state is `Expanded` when the node has children. `resourceUri` = the node's datalab URI (enables decorations). `iconPath` = `{light, dark}` node SVGs. `description`: transforms show `lastRun.durationMs` formatted `1.2s`; outputs show the row count when `Array.isArray(parse(...).data)`, e.g. `48,213 rows`.
- [ ] **Step 2:** Decorations as in spec §1 Tree: badges `✓`/`!`/`•`, colours `testing.iconPassed`/`testing.iconFailed`/`editorWarning.foreground`, tooltip = `lastRun.error` or `Out of date — input or script changed since last run`. Refresh on session change and on FS `onDidChangeFile`.
- [ ] **Step 3:** `jscratch.addInput` quick pick, with the four items and exact labels from spec §1 Adding inputs. Name prompts use `validateInput: v => validateFileName(v, existing)`. Clipboard default name `input.<guessFormat ext>`.
- [ ] **Step 4:** Drag-and-drop: each dropped `file:` URI is copied into the session as an input, and name collisions get a `-2`, `-3` suffix.
- [ ] **Step 5:** `package.json`: `viewsWelcome` for `jscratch.pipelineView` (when `!jscratch.hasSession`: `[New Session](command:jscratch.newSession)` + a toolbox line; when `jscratch.hasSession && jscratch.sessionEmpty`: `[Add Input](command:jscratch.addInput)`). Set those context keys via `setContext` on session change. Inline menu entries per spec §1 Inline actions. `commandPalette` hiding per spec §6. `category: "JScratch"` everywhere. Drop the `JScratch:` prefix from titles, since category supplies it. View title = session name (delete the "Active Session: X" code).
- [ ] **Step 6:** F5: a 3-level chain renders nested; editing the input makes its transform show `•`; dropping a file from the explorer adds an input; the welcome view shows on a fresh profile. Commit `feat(etl): nested pipeline tree, status badges, input sources, welcome views`.

### Task 8: Tool contract, registry, encode tools

**Files:** Create `src/tools/types.ts`, `src/tools/registry.ts`, `src/tools/encode/{base64,url,html,hex,jwt}.ts`, `test/unit/tools/encode.test.ts`, `test/unit/tools/registry.test.ts`.

**Interfaces:**
- Produces: the types in spec §2 Tool contract, verbatim. Registry:
  - `allTools(): Tool[]` (ordered encode → convert → generate → inspect; later tasks append to the array in `registry.ts`)
  - `resolveTool(id: string | undefined): Tool` (falls back to `allTools()[0]`)
  - `searchTools(q: string): Tool[]` (case-insensitive substring over title + keywords + id)
  - `runTool(id: string, fields: Record<string,string>, options?: Record<string,unknown>): ToolResult` (fills option defaults; any field > 5 MB (`5 * 1024 * 1024` UTF-16 length) → `{ok:false, error:"Input too large (max 5 MB)"}`; catches throws → `{ok:false, error: e.message}`; unknown id → `{ok:false, error:"Unknown tool: <id>"}`)
  - `quickActions(): { tool: Tool; action: { label: string; options: Record<string, unknown> } }[]`
- Each encode tool: option `mode` (`select`, choices `["encode","decode"]`, default `"encode"`), one multiline field `input`. Base64 adds `urlSafe` checkbox; URL adds `scope` (`component` | `uri`). JWT has no mode. Its output is `{header, payload}` pretty JSON, `meta` = `"expires <ISO> (in 2h)"` / `"expired 3d ago"` / `"no exp claim"`, and it shows the line `Signature not verified.` in meta. Quick actions per spec §2 Other entry points.

- [ ] **Step 1: Write failing tests**
  - base64 encode `"héllo"` → `"aMOpbGxv"`; decode back; urlSafe encode of `"??>"` has no `+` `/` `=`; decode `"%%%"` → `!ok`
  - url component encode `"a b&c"` → `"a%20b%26c"`; decode `"%E0%A4%A"` → `!ok`
  - html encode `'<a href="x">'` → `"&lt;a href=&quot;x&quot;&gt;"`; decode `"&#x1F600;&amp;"` → `"😀&"`
  - hex `"hi"` ⇄ `"6869"`; decode `"zz"` → `!ok`
  - jwt with payload `{exp: now+7200}` → output contains `"exp"`, meta matches `/in 2h/` and `/Signature not verified/`; `"a.b"` → `!ok`
  - registry: `runTool("nope", {})` error; 5MB+1 field → exact error; `resolveTool("gone").id === allTools()[0].id`; `searchTools("b64")[0].id === "base64"`; a tool that throws → `{ok:false}`
- [ ] **Step 2:** Run. Expected: FAIL. **Step 3:** Implement with `Buffer`/`TextEncoder` only. **Step 4:** Run. Expected: PASS.
- [ ] **Step 5:** Commit `feat(tools): registry and encode tools`

### Task 9: Convert tools

**Files:** Create `src/tools/convert/{json,yaml,csv,toml,tsTypes}.ts`, `test/unit/tools/convert.test.ts`. Add devDeps `yaml`, `smol-toml`.

**Interfaces:** Consumes `serialize`/`parse` (T2) for CSV, `inferType` (T1) for TS types. Ids: `json-format`, `json-yaml`, `json-csv`, `json-toml`, `json-ts`. The ⇄ tools take option `direction` (`"to"` default = from JSON, `"from"`). `json-format` options: `style` (`pretty`|`minify`), `indent` (number, 2), `sortKeys` (checkbox, false; recursive).

- [ ] **Step 1: Write failing tests:** round-trips for yaml/toml/csv on `{a:1,b:[1,2]}` (CSV on `[{a:1,b:"x"}]`); `json-format` minify → `'{"a":1}'`; sortKeys orders nested keys; TOML from a top-level array → `!ok` with `/TOML needs an object/`; invalid JSON input → error contains the `JSON.parse` message; `json-ts` on `{id:1}` → output starts `interface Root {` and contains `id: number;`.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(tools): convert tools`

### Task 10: Generate tools

**Files:** Create `src/tools/generate/{uuid,timestamp,hash,lorem,random}.ts`, `test/unit/tools/generate.test.ts`.

**Interfaces:** Ids `uuid`, `timestamp`, `hash`, `lorem`, `random`. `uuid`: options `version` (`v4`|`v7`), `count` (1–1000, default 1), no fields; v4 = `crypto.randomUUID()`; v7 per RFC 9562 (48-bit ms timestamp, version nibble 7, variant 10). `timestamp`: field `input`; empty → now; integer ≤ 1e11 = seconds, else ms; parseable date string → epoch. Output lines `ISO`, `Local`, `Unix s`, `Unix ms`, `Relative`. `hash`: `algorithm` (md5/sha1/sha256/sha512, default sha256), `encoding` (hex/base64). `lorem`: `unit` (words/sentences/paragraphs), `count` (default 3). `random`: `length` (default 24), checkboxes `upper`/`lower`/`digits`/`symbols` (all true but symbols), using `crypto.randomInt`.

- [ ] **Step 1: Write failing tests:** v4/v7 match their regexes (`/^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab]/` for v7); two v7s generated 2ms apart sort lexically in order; count 3 → 3 lines; timestamp `"0"` → contains `1970-01-01T00:00:00.000Z`; `"1700000000"` treated as seconds; `"garbage"` → `!ok`; sha256 `"abc"` hex === `ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad`; random length 40 with only digits → `/^\d{40}$/`; all charsets off → `!ok` `/Pick at least one character set/`; lorem words 5 → 5 words.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(tools): generate tools`

### Task 11: Inspect tools

**Files:** Create `src/tools/inspect/{regex,jsonpath,diff,cron}.ts`, `test/unit/tools/inspect.test.ts`. Add devDeps `jsonpath-plus`, `cronstrue`.

**Interfaces:** `ToolResult`'s ok variant gains an optional `data?: unknown` for structured payloads the webview renders (regex highlight ranges). Update `types.ts` (the spec already lists it). Ids:
- `regex`: fields `pattern`, `flags` (single line), `text` (multiline). Output is one line per match `#1 [start-end] "match"` + groups. `data = { ranges: [start, end][] }`. Always adds `g` internally, and caps at 1000 matches with meta `1000+ matches (capped)`. Invalid pattern → `!ok` with the engine's message.
- `jsonpath`: fields `json`, `path`. Output = pretty JSON array of results; meta `N results`.
- `diff`: fields `left`, `right`. `run` returns a unified-ish line summary (`+N −M lines changed`) as meta, and `output = ""`. The dashboard's **Open Diff** button is wired in Task 13.
- `cron`: field `expression`. Output = cronstrue description + `Next runs:` + 5 local ISO times, computed by a small `nextRuns(expr, from: Date, n)` that supports 5-field cron with `*`, lists, ranges, steps. Six-field/`@yearly` macros → `!ok` `/Only 5-field cron is supported/`.

- [ ] **Step 1: Write failing tests:** regex `(\d+)` on `"a1b22"` → 2 matches, ranges `[[1,2],[3,5]]`; `"("` → `!ok`; a pattern matching empty strings doesn't loop forever (`"a*"` on `"bbb"` terminates); jsonpath `$..id` on `{a:{id:1},b:[{id:2}]}` → `[1,2]`; cron `*/15 * * * *` from `2026-01-01T00:07:00` → next `00:15`, `00:30`, …; cron `0 9 * * 1-5` description contains `Monday through Friday`; diff counts.
- [ ] **Step 2–4:** fail → implement → pass.
- [ ] **Step 5:** Commit `feat(tools): inspect tools`

### Task 12: Webview infrastructure

**Files:** Create `src/webview/html.ts`, `src/webview/styles.css`, `src/webview/protocol.ts`. Modify `esbuild.js`, `.vscodeignore`.

**Interfaces:**
- Produces:
  - `renderHtml(webview: Webview, extUri: Uri, opts: { script: string /* "toolbox" | "preview" */; title: string }): string`. CSP exactly as in spec §2 Dashboard. Includes `out/webview/codicon.css` with `id="vscode-codicon-stylesheet"` (required by vscode-elements), `out/webview/styles.css`, and `out/webview/<script>.js` with the nonce. Body is `<div id="app"></div>`.
  - `webviewOptions(extUri): WebviewOptions & WebviewPanelOptions` → `enableScripts: true, retainContextWhenHidden: false, localResourceRoots: [out/webview, media]`.
  - `protocol.ts`: discriminated unions `ToWebview` / `FromWebview` for both panels (shapes defined in Tasks 13 and 15; this file is where they're declared).
- [ ] **Step 1:** `esbuild.js`: add a second context with entries `src/webview/toolbox.ts`, `src/webview/preview.ts` → `out/webview/`, `platform: "browser"`, `format: "iife"`. Copy `node_modules/@vscode/codicons/dist/codicon.{css,ttf}` and `src/webview/styles.css` to `out/webview/` in an `onEnd` hook. Watch mode watches both contexts.
- [ ] **Step 2:** `.vscodeignore`: add `node_modules/**` then `!node_modules/esbuild/**` and `!node_modules/@esbuild/**`. Also add `docs/**`, `scripts/**`, `test/**`, `media/*.svg` except the ones referenced (`!media/activity.svg`, `!media/nodes/**`).
- [ ] **Step 3:** Stub `toolbox.ts`/`preview.ts` that render "hello", then `npm run compile`. Expected: `out/webview/{toolbox,preview}.js`, `codicon.css`, `codicon.ttf`, `styles.css` all exist. Run `npx vsce ls`: the list contains esbuild, contains no `papaparse`, and has no `.ts` sources. Commit `build: webview bundles and packaging`.

### Task 13: Toolbox dashboard

**Files:** Create `src/toolbox/toolboxPanel.ts`. Write `src/webview/toolbox.ts`. Extend `src/webview/protocol.ts` and `styles.css`.

**Interfaces:**
- Consumes: registry (T8), `renderHtml` (T12), `SessionManager.addNode` + `validateFileName` (T4) for Send to Pipeline.
- Produces: `ToolboxPanel.show(ctx, toolId?: string, prefill?: string): void` (singleton; reveal + post `focusTool`). Protocol:
  - host→web: `{type:"init", tools: ToolMeta[], selected: string, prefill?: string}`, `{type:"focusTool", id, prefill?}`, `{type:"result", requestId: number, result: ToolResult}`, `{type:"selection", text}`. `ToolMeta` = `Tool` minus `run`.
  - web→host: `{type:"run", requestId, toolId, fields, options}`, `{type:"copy"|"insert"|"openEditor"|"sendToPipeline", text, toolId}`, `{type:"openDiff", left, right}`, `{type:"requestSelection"}`, `{type:"requestClipboard"}`, `{type:"selected", toolId}` (host saves the last tool to globalState `jscratch.lastTool`).
- [ ] **Step 1: Host.** `run` → `runTool`, reply with the same `requestId` (the webview drops stale responses: only the latest requestId renders). `insert` targets the last active text editor captured on `window.onDidChangeActiveTextEditor`, ignoring the panel. `openEditor` → untitled doc with `outputLanguage`. `sendToPipeline` → no session = error toast with a `New Session` button; else name prompt (default `<toolId>-output.<guessFormat>`, validated). `openDiff` → two docs registered on a tiny read-only `jscratch-diff:` content provider, then `vscode.diff` with title `Left ↔ Right`. Clipboard via `env.clipboard`.
- [ ] **Step 2: Webview.** Layout per spec §2 Dashboard: left rail = `vscode-textfield` search + category headers (codicons from spec §4) + tool rows. Right = title + `vscode-textarea`/`vscode-textfield` per field, options rendered by `kind`, output `<pre>`, `meta` line, error box, action `vscode-button`s with codicons (`copy`, `insert`, `go-to-file`, `type-hierarchy-sub` for Send to Pipeline). Regex: render `text` with `<mark>` over `data.ranges`. Diff: the **Open Diff** button replaces the output area. The first field gets two small icon buttons: `selection` (posts `requestSelection`, host replies `selection`) and `clippy` (paste via `navigator.clipboard.readText()`, with a host `env.clipboard` fallback through a `{type:"requestClipboard"}` message that also gets a `selection`-shaped reply). Generators (no fields) show a **Generate** button and also run once on selection. 150 ms debounce. Below 600px width the rail becomes a `vscode-single-select`. `vscode.setState({selected, values: {[toolId]: {fields, options}}})`. On init, the selected tool = `resolveTool`'d state → `init.selected`.
- [ ] **Step 3:** Command `jscratch.openToolbox` (palette + view title of Toolbox view). F5 manual pass: search `b64` → Base64; type → live output; the error state renders; Insert puts text in the editor that was active before; Send to Pipeline creates an input; Open Diff opens the native diff; hide/reshow the panel keeps values; Dark+, Light+, High Contrast all legible.
- [ ] **Step 4:** Commit `feat(toolbox): dashboard webview`

### Task 14: Toolbox tree, launcher, editor quick actions

**Files:** Create `src/toolbox/{toolboxTree,launcher,editorActions}.ts`. Modify `package.json`, `src/extension.ts`.

**Interfaces:** Consumes `allTools`, `quickActions`, `runTool` (T8), `ToolboxPanel.show` (T13).

- [ ] **Step 1:** View `jscratch.toolboxView` named "Toolbox", placed between Pipeline and History. Tree: 4 categories (labels `Encode / Decode`, `Format / Convert`, `Generate`, `Inspect`, codicons per spec §4) → tools (codicon `tool.icon`, `command: jscratch.openTool` with the id).
- [ ] **Step 2:** `jscratch.openTool` (arg: optional id). With no id it shows a quick pick: items `$(icon) Title`, `description` = keywords, `kind: Separator` per category, `matchOnDescription: true`. Then `ToolboxPanel.show(id, activeEditor selection text || undefined)`. Keybinding `ctrl+alt+j` / mac `cmd+alt+j`.
- [ ] **Step 3:** Editor submenu: `contributes.submenus` `jscratch.editorSubmenu` labelled `JScratch`, in `editor/context` when `editorHasSelection`. Register one command per quick action, `jscratch.quick.<toolId>.<index>`, with its title from the action label. These must be declared statically in `package.json`. Add a unit test (`test/unit/manifest.test.ts`) asserting the set of `jscratch.quick.*` commands in `package.json` equals the set derived from `quickActions()`, so the two can't drift. Behaviour per spec §2: replace the selection via `editor.edit`, except `jwt`, which opens an untitled JSON doc. On `!ok`: `showErrorMessage(result.error)`, text untouched.
- [ ] **Step 4:** `npm run test:unit` passes (manifest test). F5: select base64 text → right-click → JScratch › Base64 Decode replaces it; invalid input shows a toast and leaves the text unchanged; `Ctrl+Alt+J` opens the launcher. Commit `feat(toolbox): sidebar tree, launcher, editor quick actions`.

### Task 15: Data preview

**Files:** Create `src/preview/previewPanel.ts`, `src/preview/schema.ts`, `test/unit/schema.test.ts`. Write `src/webview/preview.ts`. Modify `package.json`, `src/etl/codeLens.ts`.

**Interfaces:**
- Consumes: `parse`, `tabulate` (T2), `renderHtml` (T12).
- Produces: `columnSchema(columns: string[], rows: unknown[][]): { name: string; type: "number"|"string"|"boolean"|"null"|"mixed"; nulls: number }[]` (pure; null/undefined count as nulls and don't affect type; all-null → `"null"`). `PreviewPanel.show(uri: Uri)`, one panel per URI string, reused. Protocol host→web `{type:"data", file, columns, rows, totalRows, schema}` | `{type:"notTabular", file, summary}` where `summary` = `"object with 12 keys: a, b, c…"` / `"string (3.2 KB)"`. web→host `{type:"openAsText"}`.
- [ ] **Step 1: Write failing tests:** `columnSchema(["a","b"], [[1,"x"],[null,2]])` → a: number, 1 null; b: mixed.
- [ ] **Step 2:** Run. Expected: FAIL. Implement `columnSchema`. Run. Expected: PASS.
- [ ] **Step 3: Host.** Rows are sliced to `jscratch.preview.maxRows`. Schema is computed over **all** rows, not just the slice. Re-post on `fileSystemProvider.onDidChangeFile` for that URI. Dispose the listener with the panel.
- [ ] **Step 3b: Webview.** Sticky header with type chips (`123`, `abc`, `t/f`, `∅`, `≠` for mixed) and null counts in the header tooltip. Click a header to toggle sort asc/desc/none (numbers numeric, others `localeCompare`, nulls last). Filter textfield (substring over the stringified row, debounced 100 ms). Footer `showing {shown} of {totalRows} rows · {n} columns` with `toLocaleString()` numbers; when the filter is active `{matched} matching`. Cells with objects show compact JSON, truncated to 120 chars with full text in `title`.
- [ ] **Step 4:** Command `jscratch.preview` (tree inline on input/output, `editor/title` when `resourceScheme == datalab && resourceExtname =~ /\.(json|csv|jsonl|ndjson|txt)$/`, and palette as "Preview Current File"). CodeLens on transforms gains `$(table) Preview Input`.
- [ ] **Step 5:** F5 with a generated 50,000-row CSV (`node -e` loop): preview opens in under 2s, shows `showing 1,000 of 50,000 rows`, sort and filter work, re-running a transform updates an open output preview. Commit `feat(preview): data preview table`.

### Task 16: Integration tests

**Files:** Create `test/integration/runTest.ts`, `test/integration/suite/index.ts`, `test/integration/suite/pipeline.test.ts`. Modify `package.json` scripts (`"test": "npm run compile && tsc -p . --outDir out && node ./out/test/integration/runTest.js"`). The tsc emit is separate from the esbuild bundle.

**Interfaces:** Consumes commands from T5/T7/T15. Export a test-only accessor from `activate`'s return value: `{ sessionManager, executor }`, so tests don't drive UI prompts.

- [ ] **Step 1: Write the tests** (mocha TDD, via `@vscode/test-electron`):
  - activation registers `jscratch.newSession`, `jscratch.openToolbox`, `jscratch.preview`
  - `sessionManager.createSession("t")` → input `data.csv` written with `name\nA\nB` → add transform node with a script returning `input.data.map(r => r.name)` → `executor.run` → returns true, the output file `transform-1.out.json` equals `["A","B"]` pretty-printed, and `lastRun.ok`
  - after `setSession` and a fresh `SessionManager(... same memento).restore()`, the active id is restored
  - `jscratch.preview` on the output URI opens a webview panel (`window.tabGroups` contains a tab whose input is `TabInputWebview`)
- [ ] **Step 2:** `npm test`. Expected: all pass. Fix whatever doesn't.
- [ ] **Step 3:** Commit `test: integration suite`

### Task 17: Docs, changelog, release prep

**Files:** Modify `README.md`, `package.json`. Create `CHANGELOG.md`.

- [ ] **Step 1:** README in the personal register (see the user's writing-style rules: lead with a real "why this exists" line, no hype words). Sections: what it is · ETL walkthrough that matches `templates.ts` exactly (copy the generated template; no `export default`) · Toolbox table (19 tools, one line each) · Quick actions & launcher (`Ctrl+Alt+J`) · Data preview · Settings table (spec §5) · Commands. Image `media/full.png`. Keep the old release notes out, since they go to CHANGELOG.
- [ ] **Step 2:** CHANGELOG.md: the existing 0.0.1–0.0.4 notes moved verbatim + a 0.1.0 entry listing user-visible changes. Call out that **CSV inputs now parse to objects keyed by header** and that existing transforms indexing `row[0]` must switch to `row.<column>`.
- [ ] **Step 3:** `package.json`: `version: "0.1.0"`, `description: "ETL scratchpad and offline dev toolbox for VS Code"`, `categories: ["Data Science", "Formatters", "Other"]`, `keywords` (etl, json, csv, base64, jwt, uuid, regex, yaml, toolbox).
- [ ] **Step 4: Final verification.** `npm ci && npm run lint && npm run test:unit && npm test && npx vsce package`. Expected: all green and a `.vsix` produced. Install the vsix in a clean profile (`code --user-data-dir /tmp/... --install-extension jscratch-0.1.0.vsix`) and repeat the Task 13 manual pass in Light+, Dark+ and High Contrast, plus a narrow sidebar.
- [ ] **Step 5:** Commit `docs: README, CHANGELOG, 0.1.0`. **Do not merge to master.** That triggers a release, and it's the user's call.
