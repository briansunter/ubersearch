import { $ } from "bun";

await Bun.build({
  entrypoints: ["./src/cli.ts"],
  outdir: "./dist",
  target: "bun",
  minify: false,
  sourcemap: "external",
});

await $`cp -r providers/searxng dist/providers/`;

console.log("Build complete! Run with: bun dist/cli.js");
