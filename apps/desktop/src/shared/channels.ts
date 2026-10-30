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
} as const;
