import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

/**
 * TP-D1 — electron-vite shell. D11 (reorg step 4a): the main build has TWO entries —
 * the window/main process and the services utility process (src/utility) forked
 * by main. The renderer owns its lib copies (reorg step 2).
 */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          index: resolve(__dirname, "src/main/index.ts"),
          utility: resolve(__dirname, "src/utility/index.ts"),
        },
      },
    },
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
