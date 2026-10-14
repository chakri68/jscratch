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
        // Inline map + --enable-source-maps: stacks name userTransform.ts lines, not out.js.
        sourcemap: "inline",
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
    const outcome = await spawnAndWait(req, dir, [
      "--enable-source-maps",
      outFile,
      inputPath,
      resultPath,
    ]);
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
      // retries ride out transient Windows locks (antivirus, indexer)
      fs.rmSync(dir, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
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
    // Set when we kill the child; reported once it has actually exited.
    let killedAs: Outcome | undefined;
    const finish = (o: Outcome) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      req.signal?.removeEventListener("abort", onAbort);
      resolve(o);
    };
    // Resolve only after the child exits: it runs with the temp dir as cwd,
    // and Windows won't delete that dir while the process is still in it.
    // The cap covers a child that somehow never reports close.
    const kill = (o: Outcome) => {
      if (killedAs) return;
      killedAs = o;
      child.kill("SIGKILL");
      setTimeout(() => finish(o), 2000).unref();
    };
    const onAbort = () => kill({ kind: "cancelled" });

    timer = setTimeout(() => kill({ kind: "timeout" }), req.timeoutMs);
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
      finish(killedAs ?? { kind: "exit", code });
    });
  });
}
