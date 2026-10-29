import { contextBridge, ipcRenderer } from "electron";
import type { ChatEvent, Project } from "@oia/schema";
import type { ChatRequestIpc } from "../shared/ipc.js";

/**
 * Q7 — the ONLY bridge surface. Explicit methods, no generic invoke passthrough;
 * chat events stream over a subscription the renderer can tear down.
 */
const api = {
  chatRun: (req: ChatRequestIpc): Promise<{ jobId: string; outcome: "completed" | "failed" | "cancelled" | "refused" }> =>
    ipcRenderer.invoke("chat:run", req),
  onChatEvent: (cb: (ev: ChatEvent) => void): (() => void) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: ChatEvent) => cb(ev);
    ipcRenderer.on("chat:event", listener);
    return () => ipcRenderer.removeListener("chat:event", listener);
  },
  cancelChat: (jobId: string): Promise<boolean> => ipcRenderer.invoke("chat:cancel", { jobId }),
  providerStatus: (): Promise<{
    image: { name: string; capabilities: { isMock: boolean } };
    llm: { name: string; capabilities: { isMock: boolean } };
    quota: { day: string; planner: number; image: number; limitHits: number };
  }> => ipcRenderer.invoke("provider:status"),
  createProject: (p: { name?: string; scene?: unknown }): Promise<Project> =>
    ipcRenderer.invoke("projects:create", p),
  getProject: (id: string): Promise<Project | null> => ipcRenderer.invoke("projects:get", { id }),
};

contextBridge.exposeInMainWorld("oia", api);
export type OiaBridge = typeof api;
