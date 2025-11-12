import esbuild from "esbuild";
import { rmSync, mkdirSync, copyFileSync, readdirSync, statSync, watch as fsWatch } from "node:fs";
import { join } from "node:path";

const isWatch = process.argv.includes("--watch");

function copyDir(srcDir, destDir) {
  mkdirSync(destDir, { recursive: true });
  for (const entry of readdirSync(srcDir)) {
    const src = join(srcDir, entry);
    const dest = join(destDir, entry);
    if (statSync(src).isDirectory()) copyDir(src, dest);
    else copyFileSync(src, dest);
  }
}

function copyStaticOnce() {
  copyDir("public", "dist");
  copyDir("assets", "dist/assets");
  copyFileSync("src/manifest.json", "dist/manifest.json");
  console.log("[static] copied public/, assets/ and manifest.json");
}

function watchStatic() {
  // Simple, dependency-free watcher; re-copies on any change
  fsWatch("public", { recursive: true }, (_event, _filename) => {
    try { copyDir("public", "dist"); console.log("[static] re-copied public/"); } catch {}
  });
  fsWatch("assets", { recursive: true }, (_event, _filename) => {
    try { copyDir("assets", "dist/assets"); console.log("[static] re-copied assets/"); } catch {}
  });
  fsWatch("src/manifest.json", {}, () => {
    try { copyFileSync("src/manifest.json", "dist/manifest.json"); console.log("[static] re-copied manifest.json"); } catch {}
  });
}

rmSync("dist", { recursive: true, force: true });
copyStaticOnce();

const buildOptions = {
  entryPoints: {
    "popup": "src/popup.ts",
    "content": "src/content.ts",
    "background": "src/background.ts"
  },
  bundle: true,
  sourcemap: true,
  format: "esm",
  outdir: "dist",
  target: ["chrome120"],
  minify: false,
  logLevel: "info"
};

if (isWatch) {
  const ctx = await esbuild.context(buildOptions);
  await ctx.watch();
  watchStatic();
  console.log("Watching…");
} else {
  await esbuild.build(buildOptions);
  console.log("Build complete.");
}
