import esbuild from "esbuild";
import {
  rmSync,
  mkdirSync,
  copyFileSync,
  readdirSync,
  statSync,
  watch as fsWatch,
} from "node:fs";
import { join } from "node:path";
import { config } from "dotenv";

config();

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

  copyFileSync("src/manifest.json", "dist/manifest.json");
  console.log("[static] copied public/, assets/ and manifest.json");
}

function watchStatic() {
  // Simple, dependency-free watcher; re-copies on any change
  fsWatch("public", { recursive: true }, (_event, _filename) => {
    try {
      copyDir("public", "dist");
      console.log("[static] re-copied public/");
    } catch {}
  });
  fsWatch("src/manifest.json", {}, () => {
    try {
      copyFileSync("src/manifest.json", "dist/manifest.json");
      console.log("[static] re-copied manifest.json");
    } catch {}
  });
}

rmSync("dist", { recursive: true, force: true });
copyStaticOnce();

// Validation logic
let apiBaseUrl = process.env.API_BASE_URL;

if (!isWatch) {
  // Production build enforcement
  if (!apiBaseUrl) {
    console.error(
      "\x1b[31m%s\x1b[0m", // Red color
      "Error: API_BASE_URL is not set. It is required for production builds."
    );
    process.exit(1);
  }

  if (!apiBaseUrl.startsWith("https://")) {
    console.error(
      "\x1b[31m%s\x1b[0m", // Red color
      "Error: API_BASE_URL must start with 'https://' for production builds (Chrome Web Store requirement)."
    );
    process.exit(1);
  }
} else {
  // Development fallback
  if (!apiBaseUrl) {
    apiBaseUrl = "http://localhost:8081";
    console.log(
      "\x1b[33m%s\x1b[0m", // Yellow color
      "Warning: API_BASE_URL not set, defaulting to http://localhost:8081 for development."
    );
  }
}

const buildOptions = {
  entryPoints: {
    popup: "src/popup.ts",
    content: "src/content.ts",
    background: "src/background.ts",
  },
  bundle: true,
  sourcemap: true,
  format: "esm",
  outdir: "dist",
  target: ["chrome120"],
  minify: false,
  logLevel: "info",
  define: {
    "process.env.SUPABASE_URL": JSON.stringify(process.env.SUPABASE_URL),
    "process.env.SUPABASE_ANON_KEY": JSON.stringify(
      process.env.SUPABASE_ANON_KEY
    ),
    "process.env.API_BASE_URL": JSON.stringify(apiBaseUrl),
  },
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
