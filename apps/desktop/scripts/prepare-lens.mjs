import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
const python = process.env.OIA_LENS_PYTHON ?? (process.platform === "win32" ? "python" : "python3");
execFileSync(python, [fileURLToPath(new URL("./prepare-lens.py", import.meta.url))], { stdio: "inherit", windowsHide: true });
