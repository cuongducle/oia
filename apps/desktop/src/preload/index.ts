import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/channels.js";
import type { OiaBridge } from "../shared/bridge.js";

/**
 * Q7 — implements the ONE bridge contract (shared/bridge.ts). Explicit methods only;
 * runs sandboxed (contextBridge + ipcRenderer are available without node access).
 */
const api: OiaBridge = {
  chatRun: (req) => ipcRenderer.invoke(IPC.chatRun, req),
  onChatEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: Parameters<typeof cb>[0]) => cb(ev);
    ipcRenderer.on(IPC.chatEvent, listener);
    return () => ipcRenderer.removeListener(IPC.chatEvent, listener);
  },
  cancelChat: (jobId) => ipcRenderer.invoke(IPC.chatCancel, { jobId }),
  providerStatus: () => ipcRenderer.invoke(IPC.providerStatus),
  createProject: (p) => ipcRenderer.invoke(IPC.projectsCreate, p),
  getProject: (id) => ipcRenderer.invoke(IPC.projectsGet, { id }),
  listProjects: () => ipcRenderer.invoke(IPC.projectsList),
  saveProject: (id, patch) => ipcRenderer.invoke(IPC.projectsSave, { id, ...patch }),
  removeProject: (id) => ipcRenderer.invoke(IPC.projectsRemove, { id }),
  listTemplates: () => ipcRenderer.invoke(IPC.templatesList),
  createTemplate: (t) => ipcRenderer.invoke(IPC.templatesCreate, t),
  listSessions: () => ipcRenderer.invoke(IPC.sessionsList),
  getSession: (id) => ipcRenderer.invoke(IPC.sessionsGet, { id }),
  uploadAsset: (name, bytes) => ipcRenderer.invoke(IPC.filesUpload, { name, bytes }),
  saveExport: (fileName, bytes) => ipcRenderer.invoke(IPC.exportSave, { fileName, bytes }),
};

contextBridge.exposeInMainWorld("oia", api);
