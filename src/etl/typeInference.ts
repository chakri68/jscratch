export function inferType(value: unknown, indent = ""): string {
  if (value === null) {
    return "any";
  }
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return "any[]";
    }
    return `${inferType(value[0], indent)}[]`;
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj);
    if (keys.length === 0) {
      return "{}";
    }
    const props = keys
      .map((key) => {
        const keyStr = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
          ? key
          : `"${key}"`;
        return `${indent}    ${keyStr}: ${inferType(
          obj[key],
          indent + "    ",
        )};`;
      })
      .join("\n");
    return `{\n${props}\n${indent}}`;
  }
  return typeof value;
}

/** Type definition string for an input file, by extension. Falls back to "any". */
export function typeDefForFile(filename: string, raw: string): string {
  const dot = filename.lastIndexOf(".");
  const ext = dot === -1 ? "" : filename.slice(dot).toLowerCase();
  if (ext === ".json") {
    try {
      return inferType(JSON.parse(raw), "    ");
    } catch {
      return "any";
    }
  }
  if (ext === ".csv") {
    return "string[][]";
  }
  if (ext === ".txt") {
    return "string[]";
  }
  return "any";
}
