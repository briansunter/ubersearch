import { copySearxngAssets } from "./copy-searxng-assets";

await Bun.build({
  entrypoints: ["./src/cli.ts"],
  outdir: "./dist",
  target: "bun",
  minify: false,
  sourcemap: "external",
});

try {
  await copySearxngAssets("./dist");
} catch {
  // Ignore copy failures - files might not exist in all environments
}

console.log("Build complete! Run with: bun dist/cli.js");
