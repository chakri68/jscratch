import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import * as cp from "child_process";
import * as esbuild from "esbuild";
import { parse } from "./formats";
import { WRAPPER_SOURCE } from "./wrapper";

export interface RunRequest {
  scriptSource: string;
  inputFilename: string;
  inputRaw: string;
  timeoutMs: number;
  onLog?: (line: string, stream: "stdout" | "stderr") => void;
  signal?: AbortSignal;
  nodePath?: string;
}

export interface RunResult {
  ok: boolean;
  value?: unknown;
  error?: string;
  durationMs: number;
  parseWarning?: string;
}

export async function runTransform(req: RunRequest): Promise<RunResult> {
  const start = Date.now();
  const done = (r: Omit<RunResult, "durationMs">): RunResult => ({
    ...r,
    durationMs: Date.now() - start,
  });

  if (req.signal?.aborted) return done({ ok: false, error: "Cancelled" });

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jscratch-"));
  try {
    const { data, warning } = parse(req.inputFilename, req.inputRaw);
    const parseWarning = warning;
    const inputPath = path.join(dir, "input.json");
    const resultPath = path.join(dir, "result.json");
    const outFile = path.join(dir, "out.js");
    fs.writeFileSync(
      inputPath,
      JSON.stringify({ raw: req.inputRaw, data: data === undefined ? null : data }),
    );
    fs.writeFileSync(path.join(dir, "wrapper.ts"), WRAPPER_SOURCE);
    fs.writeFileSync(path.join(dir, "userTransform.ts"), req.scriptSource);

    try {
      await esbuild.build({
        entryPoints: [path.join(dir, "wrapper.ts")],
        bundle: true,
        platform: "node",
        format: "cjs",
        outfile: outFile,
        logLevel: "silent",
      });
    } catch (e: any) {
      const msgs: esbuild.Message[] = e?.errors ?? [];
      let error = String(e?.message ?? e);
      if (msgs.length) {
        const lines = await esbuild.formatMessages(msgs, {
          kind: "error",
          color: false,
        });
        error = lines.join("\n").trim();
      }
      return done({ ok: false, error, parseWarning });
    }

    if (req.signal?.aborted) {
      return done({ ok: false, error: "Cancelled", parseWarning });
    }
    const outcome = await spawnAndWait(req, dir, [outFile, inputPath, resultPath]);
    if (outcome.kind === "timeout") {
      return done({
        ok: false,
        error: `Transform timed out after ${req.timeoutMs}ms`,
        parseWarning,
      });
    }
    if (outcome.kind === "cancelled") {
      return done({ ok: false, error: "Cancelled", parseWarning });
    }
    if (outcome.kind === "spawn-error") {
      return done({ ok: false, error: outcome.message, parseWarning });
    }

    let result: { ok: boolean; value?: unknown; error?: string } | undefined;
    try {
      result = JSON.parse(fs.readFileSync(resultPath, "utf-8"));
    } catch {
      // child died before writing a result
    }
    if (!result) {
      return done({
        ok: false,
        error: `Process exited with code ${outcome.code} without producing a result`,
        parseWarning,
      });
    }
    return done({
      ok: result.ok,
      value: result.value,
      error: result.error,
      parseWarning,
    });
  } catch (e: any) {
    return done({ ok: false, error: String(e?.message ?? e) });
  } finally {
    try {
      fs.rmSync(dir, { recursive: true, force: true });
    } catch {}
  }
}

type Outcome =
  | { kind: "exit"; code: number | null }
  | { kind: "timeout" }
  | { kind: "cancelled" }
  | { kind: "spawn-error"; message: string };

function spawnAndWait(
  req: RunRequest,
  cwd: string,
  args: string[],
): Promise<Outcome> {
  return new Promise((resolve) => {
    if (req.signal?.aborted) return resolve({ kind: "cancelled" });
    const child = cp.spawn(req.nodePath ?? process.execPath, args, {
      cwd,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });

    let settled = false;
    let timer: NodeJS.Timeout | undefined;
    const finish = (o: Outcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      req.signal?.removeEventListener("abort", onAbort);
      resolve(o);
    };
    const onAbort = () => {
      child.kill("SIGKILL");
      finish({ kind: "cancelled" });
    };

    timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish({ kind: "timeout" });
    }, req.timeoutMs);
    req.signal?.addEventListener("abort", onAbort);

    const pipe = (
      s: NodeJS.ReadableStream,
      stream: "stdout" | "stderr",
    ): (() => void) => {
      let buf = "";
      s.setEncoding("utf8");
      s.on("data", (chunk: string) => {
        buf += chunk;
        let i: number;
        while ((i = buf.indexOf("\n")) >= 0) {
          req.onLog?.(buf.slice(0, i).replace(/\r$/, ""), stream);
          buf = buf.slice(i + 1);
        }
      });
      return () => {
        if (buf) req.onLog?.(buf, stream);
        buf = "";
      };
    };
    const flushOut = pipe(child.stdout!, "stdout");
    const flushErr = pipe(child.stderr!, "stderr");

    child.on("error", (e) => finish({ kind: "spawn-error", message: e.message }));
    child.on("close", (code) => {
      flushOut();
      flushErr();
      finish({ kind: "exit", code });
    });
  });
}
