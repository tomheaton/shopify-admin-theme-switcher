/**
 * Builds the extension into dist/, which is the folder Chrome loads. Pass --watch to rebuild on
 * changes.
 */
import { rm } from "node:fs/promises";
import { type BuildOptions, build, context } from "esbuild";

const OUTDIR = "dist";

const common: BuildOptions = {
  bundle: true,
  outdir: OUTDIR,
  outbase: "src",
  target: "chrome102",
  logLevel: "info",
};

const builds: BuildOptions[] = [
  {
    ...common,
    // The service worker and options page load as modules; the static files are copied as they are
    entryPoints: ["src/background.ts", "src/options.ts", "src/manifest.json", "src/options.html"],
    format: "esm",
    loader: { ".json": "copy", ".html": "copy" },
  },
  {
    ...common,
    // Registered content scripts run as classic scripts, so each is wrapped in its own scope
    entryPoints: ["src/content/admin.ts", "src/content/embedded-app.ts", "src/content/modes/*.ts"],
    format: "iife",
  },
];

await rm(OUTDIR, { recursive: true, force: true });

if (process.argv.includes("--watch")) {
  for (const options of builds) {
    await (await context(options)).watch();
  }
} else {
  await Promise.all(builds.map((options) => build(options)));
}
