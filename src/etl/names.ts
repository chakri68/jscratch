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
