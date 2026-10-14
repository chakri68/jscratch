const esbuild = require("esbuild");
const fs = require("fs");

const production = process.argv.includes("--production");
const watch = process.argv.includes("--watch");

/**
 * @type {import('esbuild').Plugin}
 */
const esbuildProblemMatcherPlugin = {
  name: "esbuild-problem-matcher",
  setup(build) {
    build.onStart(() => {
      console.log("[watch] build started");
    });
    build.onEnd((result) => {
      result.errors.forEach(({ text, location }) => {
        console.error(`✘ [ERROR] ${text}`);
        console.error(
          `    ${location.file}:${location.line}:${location.column}:`,
        );
      });
      console.log("[watch] build finished");
    });
  },
};

/** Copies static webview assets next to the bundles. */
const copyWebviewAssets = {
  name: "copy-webview-assets",
  setup(build) {
    build.onEnd(() => {
      fs.mkdirSync("out/webview", { recursive: true });
      for (const [from, to] of [
        ["node_modules/@vscode/codicons/dist/codicon.css", "codicon.css"],
        ["node_modules/@vscode/codicons/dist/codicon.ttf", "codicon.ttf"],
        ["src/webview/styles.css", "styles.css"],
      ]) {
        fs.copyFileSync(from, `out/webview/${to}`);
      }
    });
  },
};

async function main() {
  const ctx = await esbuild.context({
    entryPoints: ["src/extension.ts"],
    bundle: true,
    format: "cjs",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "node",
    outfile: "out/extension.js",
    external: ["vscode", "esbuild"],
    logLevel: "silent",
    plugins: [
      /* add to the end of plugins array */
      esbuildProblemMatcherPlugin,
    ],
  });

  const webCtx = await esbuild.context({
    entryPoints: ["src/webview/toolbox.ts", "src/webview/preview.ts"],
    bundle: true,
    format: "iife",
    minify: production,
    sourcemap: !production,
    sourcesContent: false,
    platform: "browser",
    outdir: "out/webview",
    logLevel: "silent",
    plugins: [copyWebviewAssets, esbuildProblemMatcherPlugin],
  });

  if (watch) {
    await Promise.all([ctx.watch(), webCtx.watch()]);
  } else {
    await ctx.rebuild();
    await webCtx.rebuild();
    await ctx.dispose();
    await webCtx.dispose();
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
