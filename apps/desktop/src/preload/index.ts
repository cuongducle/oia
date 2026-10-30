import { contextBridge, ipcRenderer } from "electron";
import { IPC } from "../shared/channels.js";
import type { OiaBridge, RuntimeEvent, AgentJobFrame } from "../shared/bridge.js";

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
  submitTask: (type, params) => ipcRenderer.invoke(IPC.taskSubmit, { type, params }),
  getTask: (taskId) => ipcRenderer.invoke(IPC.taskGet, { taskId }),
  cancelTask: (taskId) => ipcRenderer.invoke(IPC.taskCancel, { taskId }),
  listBrandKits: () => ipcRenderer.invoke(IPC.brandKitsList),
  upsertBrandKit: (input) => ipcRenderer.invoke(IPC.brandKitsUpsert, input),
  removeBrandKit: (id) => ipcRenderer.invoke(IPC.brandKitsRemove, { id }),
  listApiKeys: () => ipcRenderer.invoke(IPC.apiKeysList),
  createApiKey: (name, ttlDays) => ipcRenderer.invoke(IPC.apiKeysCreate, { name, ttlDays }),
  revokeApiKey: (id) => ipcRenderer.invoke(IPC.apiKeysRevoke, { id }),
  agentStatus: () => ipcRenderer.invoke(IPC.agentStatus),
  onAgentJob: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: AgentJobFrame) => cb(ev);
    ipcRenderer.on(IPC.agentJobEvent, listener);
    return () => ipcRenderer.removeListener(IPC.agentJobEvent, listener);
  },
  runtimeStatus: () => ipcRenderer.invoke(IPC.runtimeStatus),
  runtimeInstall: () => ipcRenderer.invoke(IPC.runtimeInstall),
  runtimeLogin: () => ipcRenderer.invoke(IPC.runtimeLogin),
  runtimeLogout: () => ipcRenderer.invoke(IPC.runtimeLogout),
  runtimeSetMode: (mode) => ipcRenderer.invoke(IPC.runtimeSetMode, { mode }),
  runtimeCancel: () => ipcRenderer.invoke(IPC.runtimeCancel),
  onRuntimeEvent: (cb) => {
    const listener = (_e: Electron.IpcRendererEvent, ev: RuntimeEvent) => cb(ev);
    ipcRenderer.on(IPC.runtimeEvent, listener);
    return () => ipcRenderer.removeListener(IPC.runtimeEvent, listener);
  },
};

contextBridge.exposeInMainWorld("oia", api);
