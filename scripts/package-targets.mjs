// Builds one .vsix per platform, each carrying exactly one esbuild binary.
//
// esbuild ships its native binary as @esbuild/<platform>, and npm only installs
// the one matching the machine running `npm ci`. So a vsix built on Linux has a
// Linux binary, and transforms die on macOS/Windows. For each target we swap in
// that platform's package (pinned to the installed esbuild version) and run
// `vsce package --target`. Works from any host OS; restores node_modules after.
//
// usage: node scripts/package-targets.mjs [target ...]   (default: all targets)

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const TARGETS = {
  "linux-x64": "@esbuild/linux-x64",
  "linux-arm64": "@esbuild/linux-arm64",
  "darwin-x64": "@esbuild/darwin-x64",
  "darwin-arm64": "@esbuild/darwin-arm64",
  "win32-x64": "@esbuild/win32-x64",
  "win32-arm64": "@esbuild/win32-arm64",
};

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const scoped = path.join(root, "node_modules", "@esbuild");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const npx = process.platform === "win32" ? "npx.cmd" : "npx";
const run = (cmd, args, opts = {}) =>
  execFileSync(cmd, args, { cwd: root, stdio: "inherit", shell: process.platform === "win32", ...opts });

const { version: esbuildVersion } = JSON.parse(
  fs.readFileSync(path.join(root, "node_modules/esbuild/package.json"), "utf8"),
);
const { version } = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));

const wanted = process.argv.slice(2);
const targets = wanted.length ? wanted : Object.keys(TARGETS);
for (const t of targets) {
  if (!TARGETS[t]) {
    console.error(`unknown target "${t}" — expected one of: ${Object.keys(TARGETS).join(", ")}`);
    process.exit(1);
  }
}

const work = fs.mkdtempSync(path.join(os.tmpdir(), "jscratch-pkg-"));
const backup = path.join(work, "esbuild-backup");
fs.cpSync(scoped, backup, { recursive: true });
fs.mkdirSync(path.join(root, "dist"), { recursive: true });

// `vsce package` runs vscode:prepublish, which builds the extension with
// esbuild — on THIS machine. Point it at the host binary we just backed up,
// since node_modules is about to hold some other platform's.
const hostPkg = fs.readdirSync(backup)[0];
const hostBin = ["esbuild.exe", "bin/esbuild"]
  .map((p) => path.join(backup, hostPkg, p))
  .find((p) => fs.existsSync(p));
if (!hostBin) {
  console.error(`no esbuild binary found for this machine under node_modules/@esbuild — run npm ci first`);
  process.exit(1);
}
const env = { ...process.env, ESBUILD_BINARY_PATH: hostBin };

try {
  for (const target of targets) {
    const pkg = TARGETS[target];
    console.log(`\n── ${target} (${pkg}@${esbuildVersion})`);

    // exactly one platform binary in node_modules/@esbuild
    fs.rmSync(scoped, { recursive: true, force: true });
    const dest = path.join(scoped, pkg.split("/")[1]);
    fs.mkdirSync(dest, { recursive: true });
    const tgz = execFileSync(npm, ["pack", `${pkg}@${esbuildVersion}`, "--pack-destination", work, "--silent"], {
      cwd: root,
      encoding: "utf8",
      shell: process.platform === "win32",
    }).trim().split(/\r?\n/).pop();
    run("tar", ["-xzf", path.join(work, tgz), "-C", dest, "--strip-components=1"]);

    const out = path.join("dist", `jscratch-${version}-${target}.vsix`);
    run(npx, ["vsce", "package", "--target", target, "--out", out], { env });
  }
} finally {
  fs.rmSync(scoped, { recursive: true, force: true });
  fs.cpSync(backup, scoped, { recursive: true });
  fs.rmSync(work, { recursive: true, force: true });
}
