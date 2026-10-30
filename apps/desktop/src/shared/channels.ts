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
} as const;
