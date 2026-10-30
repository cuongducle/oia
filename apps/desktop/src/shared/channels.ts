/**
 * Channel names ONLY — pure data, safe for the sandboxed preload (no runtime deps;
 * a sandboxed preload may require nothing except electron).
 */
export const IPC = {
  chatRun: "chat:run",
  chatEvent: "chat:event", // main → renderer streaming (ChatEvent frames)
  chatCancel: "chat:cancel",
  providerStatus: "provider:status",
  projectsCreate: "projects:create",
  projectsGet: "projects:get",
  projectsList: "projects:list",
  projectsSave: "projects:save",
  projectsRemove: "projects:remove",
  templatesList: "templates:list",
  templatesCreate: "templates:create",
  sessionsList: "sessions:list",
  sessionsGet: "sessions:get",
  filesUpload: "files:upload",
  exportSave: "export:save",
  // reorg step 4c — quick tools run tasks over IPC (the web fetch lanes, ported)
  taskSubmit: "task:submit",
  taskGet: "task:get",
  taskCancel: "task:cancel",
  // reorg step 4d — brand kits + the For Agents panel (keys, loopback endpoint, live jobs)
  brandKitsList: "brandkits:list",
  brandKitsUpsert: "brandkits:upsert",
  brandKitsRemove: "brandkits:remove",
  apiKeysList: "apikeys:list",
  apiKeysCreate: "apikeys:create",
  apiKeysRevoke: "apikeys:revoke",
  agentStatus: "agent:status",
  agentJobEvent: "agentJob:event", // main → renderer (loopback + tool job lifecycle)
  clipboardWrite: "clipboard:write",
  // reorg step 5 — import a self-hosted web app's .data directory
  dataImportWeb: "data:importWeb",
  // TP-D3 — codex runtime management (status / guided download / in-app login)
  runtimeStatus: "runtime:status",
  runtimeInstall: "runtime:install",
  runtimeLogin: "runtime:login",
  runtimeLogout: "runtime:logout",
  runtimeSetMode: "runtime:setMode",
  runtimeCancel: "runtime:cancel",
  runtimeEvent: "runtime:event", // main → renderer (install progress, login URL)
} as const;
