import type { Tool } from "../types";

function part(s: string, name: string): unknown {
  if (!/^[A-Za-z0-9\-_]+$/.test(s)) {
    throw new Error(`${name} is not base64url`);
  }
  try {
    return JSON.parse(Buffer.from(s, "base64url").toString("utf8"));
  } catch {
    throw new Error(`${name} is not valid JSON`);
  }
}

function span(secs: number): string {
  const units: [string, number][] = [["d", 86400], ["h", 3600], ["m", 60], ["s", 1]];
  for (const [u, n] of units) {
    if (secs >= n) {
      return `${Math.floor(secs / n)}${u}`;
    }
  }
  return "0s";
}

function expiry(payload: unknown): string {
  const exp = (payload as { exp?: unknown } | null)?.exp;
  if (typeof exp !== "number" || !Number.isFinite(exp)) {
    return "no exp claim";
  }
  const diff = Math.floor(exp - Date.now() / 1000);
  if (diff >= 0) {
    return `expires ${new Date(exp * 1000).toISOString()} (in ${span(diff)})`;
  }
  return `expired ${span(-diff)} ago`;
}

export const jwt: Tool = {
  id: "jwt",
  title: "JWT",
  category: "encode",
  icon: "key",
  keywords: ["token", "bearer", "decode"],
  fields: [{ id: "input", label: "Token", multiline: true }],
  outputLanguage: "json",
  quickActions: [{ label: "Decode JWT", options: {} }],
  run({ input = "" }) {
    const parts = input.trim().split(".");
    if (parts.length !== 3) {
      return { ok: false, error: "Not a valid JWT: expected 3 dot-separated parts" };
    }
    let header: unknown;
    let payload: unknown;
    try {
      header = part(parts[0], "header");
      payload = part(parts[1], "payload");
    } catch (e) {
      return { ok: false, error: `Not a valid JWT: ${(e as Error).message}` };
    }
    return {
      ok: true,
      output: JSON.stringify({ header, payload }, null, 2),
      meta: `${expiry(payload)} · Signature not verified.`,
      data: { header, payload },
    };
  },
};
