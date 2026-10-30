import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * TP-D1 — electron-vite shell. The renderer owns its lib copies (reorg step 2:
 * studio-templates, studio-ui, provider-errors, i18n live in src/renderer/lib).
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      // sandboxed preloads MUST be CommonJS — force .js CJS output (not .mjs)
      rollupOptions: { output: { format: "cjs", entryFileNames: "[name].cjs" } }, // .cjs: package.json is type:module — a .js preload would load as ESM and silently fail under sandbox
    },
  },
  renderer: {
    plugins: [react()],
    resolve: {
      alias: {
        "@": resolve(__dirname, "src/renderer"),
      },
    },
  },
});
