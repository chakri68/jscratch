import type { DataFormat } from "./formats";

export function validateFileName(
  name: string,
  existing: string[],
): string | undefined {
  if (!name.trim()) {
    return "Name can't be empty";
  }
  if (/[/\\]/.test(name)) {
    return "Name can't contain a slash";
  }
  if (name === "pipeline.json") {
    return "pipeline.json is reserved";
  }
  if (existing.includes(name)) {
    return `${name} already exists`;
  }
  return undefined;
}

export function nextTransformName(existing: string[]): string {
  let max = 0;
  for (const name of existing) {
    const m = /^transform-(\d+)\.ts$/.exec(name);
    if (m) {
      max = Math.max(max, Number(m[1]));
    }
  }
  return `transform-${max + 1}.ts`;
}

/** A transform's output format. Nodes from before 0.1 have none and stay json. */
export function effectiveFormat(node: { outputFormat?: DataFormat }): DataFormat {
  return node.outputFormat ?? "json";
}

export function outputFilenameFor(
  transformFilename: string,
  format: DataFormat,
): string {
  return `${transformFilename.replace(/\.ts$/, "")}.out.${format}`;
}

/** Session id of a `datalab:/<session>/<file>` uri path. */
export function sessionIdFromUri(uri: { path: string }): string | undefined {
  return uri.path.split("/")[1] || undefined;
}

/** `data.json` -> `data-2.json`, `data-3.json`, … until it doesn't collide. */
export function uniqueName(name: string, existing: string[]): string {
  if (!existing.includes(name)) {
    return name;
  }
  const dot = name.lastIndexOf(".");
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const ext = dot > 0 ? name.slice(dot) : "";
  for (let n = 2; ; n++) {
    const candidate = `${stem}-${n}${ext}`;
    if (!existing.includes(candidate)) {
      return candidate;
    }
  }
}

/** Collision-free input filename; also steers clear of the reserved pipeline.json. */
export function safeInputName(base: string, existing: string[]): string {
  return uniqueName(base, [...existing, "pipeline.json"]);
}

/**
 * Split a `text/uri-list` payload into `file:` URIs and a count of foreign ones.
 * `datalab:` lines (a tree item dragged within the view) are ignored, not skipped.
 */
export function classifyDropUris(uriList: string): {
  files: string[];
  skipped: number;
} {
  const files: string[] = [];
  let skipped = 0;
  for (const raw of uriList.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }
    const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(line)?.[1].toLowerCase();
    if (scheme === "file") {
      files.push(line);
    } else if (scheme !== "datalab") {
      skipped++;
    }
  }
  return { files, skipped };
}
