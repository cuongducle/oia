import { chmodSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Test fakes that must actually EXECUTE run through node on every platform.
 * POSIX executes the .mjs via its shebang; Windows cannot exec shebang scripts,
 * so cross-spawn gets a .cmd shim calling the test runner's own node. The
 * returned path is what you hand to CliRuntime / bridges as `bin`.
 */
export function writeRunnableCli(dir: string, name: string, nodeScript: string): string {
  const mjs = path.join(dir, `${name}.mjs`);
  writeFileSync(mjs, `#!/usr/bin/env node\n${nodeScript}`);
  if (process.platform === "win32") {
    const cmd = path.join(dir, `${name}.cmd`);
    writeFileSync(cmd, `@node "%~dp0${name}.mjs" %*\r\n`);
    return cmd;
  }
  chmodSync(mjs, 0o755);
  return mjs;
}
