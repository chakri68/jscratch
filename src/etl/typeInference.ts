import { formatFromFilename, parse } from "./formats";

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
  if (!formatFromFilename(filename)) {
    return "any";
  }
  const { data, warning } = parse(filename, raw);
  return warning ? "any" : inferType(data, "    ");
}
