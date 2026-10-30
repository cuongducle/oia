import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * TP-D1 — electron-vite shell. The renderer aliases @oia-web into the web app's
 * transport-free libs (i18n, provider-errors) — single source, no copy.
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
        "@oia-web": resolve(__dirname, "../web"),
        "@": resolve(__dirname, "src/renderer"),
      },
    },
  },
});
