/**
 * Vite `?url` asset imports (the pdf.js worker bundle) — the build emits them as
 * RELATIVE assets next to the chunks, which survives file:// in the packaged app
 * (absolute paths break there). electron-vite does not expose vite/client types
 * to the renderer tsconfig, so declare the surface here.
 */
declare module "*?url" {
  const url: string;
  export default url;
}
