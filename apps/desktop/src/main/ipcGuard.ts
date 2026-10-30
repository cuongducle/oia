import { BrowserWindow, type IpcMainInvokeEvent } from "electron";

/**
 * F2 — IPC is for OUR renderer windows only. Sandbox + blocked navigation +
 * denied window-open make a foreign sender near-impossible; this guard makes
 * it impossible. Every ipcMain handler in the main process routes through it.
 */
export function isOwnRendererSender(event: IpcMainInvokeEvent): boolean {
  return BrowserWindow.getAllWindows().some((w) => !w.isDestroyed() && w.webContents === event.sender);
}

/** The refusal every guarded handler throws — a stable wire name for the renderer. */
export function forbiddenSenderError(): Error {
  const err = new Error("forbidden sender — IPC is reserved for the app's own windows");
  err.name = "ForbiddenSender";
  return err;
}
