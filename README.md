# JScratch

a scratchpad for poking at data without polluting the repo. then it grew a toolbox, because base64, JWT and UUID were living in five browser tabs.

![JScratch](https://github.com/chakri68/jscratch/raw/master/media/full.png)

## what it is

two things in one sidebar:

- **an ETL scratchpad.** drop some data in, write a TypeScript `transform()`, run it, get an output file. chain more transforms off that output. nothing touches your workspace: sessions live on a virtual `datalab://` filesystem backed by the extension's global storage, so there's nothing to accidentally commit.
- **a toolbox.** 19 offline dev utilities (encoders, converters, generators, inspectors) in one webview. no network, ever.

the two talk to each other: any tool output can be sent into the active session as a new input.

## the ETL walkthrough

1. click the JScratch icon in the activity bar, then **New Session**.
2. **Add Input** and pick a source: an empty file, the clipboard, a file from disk, or the active editor (selection, or the whole doc if nothing's selected). you can also drag files from the OS or explorer onto the tree.
3. hover the input and hit **Add Transform**. JScratch infers a type from the input's data and generates a script. for a `people.csv` with `name,city,age` headers, you get:

   ```ts
   import * as path from 'path';

   /* TYPE DEFS START */
   // Type definitions for the injected global 'input'
   interface InputData {
       raw: string;
       data: {
           name: string;
           city: string;
           age: number;
       }[];
   }
   /* TYPE DEFS END */

   // Declare the global 'input' variable so TypeScript knows about it
   declare const input: InputData;

   /**
    * Transformation Script
    * console.log is fine here: it goes to the JScratch output channel, not the result.
    */
   export function transform(): any {
       // TODO: Implement your transformation logic
       // Example: return input.data.map((item: any) => item.id);
       
       if (typeof input !== 'undefined' && input.data) {
           return input.data;
       }
       return {};
   }
   ```

   `input.raw` is the file as text. `input.data` is the parsed version: JSON as-is, CSV as objects keyed by the header row (numbers and booleans typed), NDJSON as one value per line, anything else as an array of lines. if parsing fails, `data` falls back to the raw string and a warning lands in the output channel.

4. write the thing. whatever `transform()` returns (or resolves to, `async` works) becomes the output.

   ```ts
   export function transform() {
       return input.data.filter((p) => p.age > 40).map((p) => p.name);
   }
   ```

5. **Run** (the ▶ CodeLens, the tree's inline button, or `Run Current Transform`). the output appears as `transform-1.out.json` under the transform and opens beside your editor.

### what actually happens on run

- the host parses the parent file and writes `{ raw, data }` to `input.json` in a temp dir.
- esbuild bundles your script with a small wrapper. compile errors go to the **JScratch** output channel and the node is marked failed.
- the bundle runs in a **separate node process** (VS Code's own binary with `ELECTRON_RUN_AS_NODE=1`). the wrapper sets the global `input`, awaits `transform()`, and writes the result to `result.json`. it never touches stdout.
- so stdout and stderr are just logs. they stream live to the JScratch output channel, prefixed with the script name. `console.log` all you want; it can't end up in your output file anymore.
- the host serializes the result to the transform's output format (json, csv, ndjson or txt; change it from the node's context menu) and writes the output node.
- a run past `jscratch.pipeline.timeoutMs` gets killed. the progress notification has a cancel button that works at any point, including mid-bundle.
- on failure you get a toast with **Show Log** and **Open Script**.

transforms are your own code with full Node access, same as any script you'd run yourself. not sandboxed, not pretending to be.

### the tree

- it's a real tree: input → transform → output → transform → … and any node can branch into several transforms.
- badges show run state: ✓ ran, ! failed, • stale (the script or its parent changed since the last run). they show up on editor tabs too.
- descriptions show row counts on outputs and the last duration on transforms.
- **Run Branch** runs a transform and then every transform downstream of it, breadth-first, stopping at the first failure.
- **Reload Types** regenerates the `TYPE DEFS` block after the input changes. only that block is touched; your code stays put.
- **Export File** writes a node out to a real file on disk.
- sessions save themselves, and the active one comes back after a restart. the **History** view has the old ones: click to load, trash icon to delete.

## Toolbox

open it from the Toolbox view in the sidebar, `JScratch: Open Toolbox`, or the launcher. search on the left, the tool on the right. tools run live as you type.

| Category | Tool | What it does |
| --- | --- | --- |
| Encode | Base64 | encode/decode, with a URL-safe toggle |
| | URL | percent-encode/decode, as a component or a full URI |
| | HTML entities | escape/unescape HTML entities |
| | Hex | text ⇄ hex bytes |
| | JWT | decodes header and payload, says when it expires. doesn't verify the signature, and says that too |
| Convert | JSON Format | pretty-print (custom indent) or minify, optional key sort |
| | JSON ⇄ YAML | either direction |
| | JSON ⇄ CSV | arrays of objects ⇄ header rows |
| | JSON ⇄ TOML | either direction |
| | JSON → TS Types | infers TypeScript types from a JSON sample |
| Generate | UUID | v4 or v7, as many as you want |
| | Timestamp | epoch s/ms or a date string → ISO, local, unix and relative. empty input = now |
| | Hash | md5 / sha1 / sha256 / sha512, as hex or base64 |
| | Lorem Ipsum | n words, sentences or paragraphs |
| | Random String | length plus charset toggles (upper, lower, digits, symbols) |
| Inspect | Regex Tester | pattern + flags against text. lists matches and groups, highlights them inline |
| | JSONPath | query JSON with a path like `$..id` |
| | Text Diff | compare two blobs. **Open Diff** hands them to VS Code's own diff editor |
| | Cron Explain | 5-field cron → English, plus the next 5 run times |

every output has **Copy**, **Insert** (into the editor you were last in), **Open in Editor**, and **Send to Pipeline**, which drops it into the active session as a new input. the first field has buttons for the editor selection and the clipboard. the panel remembers the last tool and its values.

## Quick actions & launcher

- **launcher:** `Ctrl+Alt+J` (`Cmd+Alt+J` on mac). a quick pick over every tool, grouped by category, matching titles and keywords (`b64` finds Base64). it opens the toolbox prefilled with whatever you had selected.
- **quick actions:** select some text, right-click, **JScratch ›**. Base64 Encode/Decode, URL Encode/Decode, Format JSON, Minify JSON, JSON → YAML replace the selection in place. Decode JWT opens its result in a new tab instead, because replacing your token with a JSON blob would be rude. if a tool fails you get a toast and your text stays as it was.

## Data preview

**Preview** on any input or output node (or the table button in the editor title on `datalab://` data files, or the **Preview Input** CodeLens on a transform) opens the file as a table.

- arrays of objects become columns (the union of all keys); CSV comes through the same way.
- each column header gets a chip for its inferred type (number, string, boolean, null, mixed); hover it for the null count. click a header to sort, type in the filter box to substring-match across rows.
- the footer reads like `showing 1,000 of 48,213 rows · 7 columns`. only the first `jscratch.preview.maxRows` rows are sent to the webview, so big files stay cheap.
- it refreshes when the file changes, so it follows along as you re-run.
- anything that isn't tabular shows its top-level shape and an **Open as text** button.

## Settings

| Key | Default | What it does |
| --- | --- | --- |
| `jscratch.pipeline.runOnSave` | `false` | run a transform when you save it |
| `jscratch.pipeline.timeoutMs` | `60000` | kill a transform after this many milliseconds (min 1000) |
| `jscratch.pipeline.defaultOutputFormat` | `"json"` | output format for transforms that don't set their own: `json`, `csv`, `ndjson`, `txt` |
| `jscratch.preview.maxRows` | `1000` | max rows sent to the data preview |

## Commands

in the command palette:

| Command | What it does |
| --- | --- |
| `JScratch: New Session` | start an empty session |
| `JScratch: Add Input` | add an input to the active session |
| `JScratch: Run Current Transform` | run the transform in the active editor |
| `JScratch: Preview Current File` | open the data preview for the active file |
| `JScratch: Open Toolbox` | open the toolbox panel |
| `JScratch: Open Tool…` | the launcher (`Ctrl+Alt+J` / `Cmd+Alt+J`) |
| `JScratch: Clear History` | delete all saved sessions |

on tree nodes: **Add Transform**, **Run Branch**, **Reload Types**, **Set Output Format**, **Export File**, **Preview**, **Delete**. in History: click a session to load it, trash icon to delete.

## Requirements

VS Code 1.85 or newer. that's it. esbuild ships inside the extension, and transforms run on the Node that VS Code already has.

release notes live in [CHANGELOG.md](CHANGELOG.md).
