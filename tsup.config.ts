import { defineConfig } from "tsup";

// Subpath entries. `splitting` keeps one copy of shared classes (Schema, Iran) across subpaths in both ESM and CJS.
const entry = {
  index: "src/index.ts",
  infer: "src/infer/index.ts",
  output: "src/output.ts",
  seed: "src/seed.ts",
  server: "src/server.ts",
  validate: "src/validate.ts",
  jalali: "src/jalali.ts",
  ai: "src/ai.ts",
  frontend: "src/frontend/index.ts",
  "frontend-runtime": "src/frontend/runtime-entry.ts",
  "frontend-client": "src/frontend/client.ts",
};

export default defineConfig([
  { entry, format: ["esm", "cjs"], dts: true, clean: true, target: "es2022", splitting: true, treeshake: true, sourcemap: false },
  { entry: { cli: "src/cli.ts" }, format: ["esm"], target: "node18", splitting: false, banner: { js: "#!/usr/bin/env node" }, clean: false },
  {
    entry: { "farsi-mock": "src/browser.ts" }, format: ["iife"], globalName: "FarsiMock", platform: "browser", target: "es2020",
    minify: true, clean: false, outExtension: () => ({ js: ".global.js" }),
  },
]);
