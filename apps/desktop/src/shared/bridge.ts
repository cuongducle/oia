import type { ChatEvent, Project, Template } from "@oia/schema";
import type { ChatRequest, ChatOutcome } from "@oia/services";

/**
 * The bridge contract — defined ONCE. preload implements it, the renderer consumes it,
 * and the request/response types come from @oia/services (no hand mirrors, no drift).
 * Channels live in ./channels.ts; only the surface shape lives here.
 */

/** The editor AI dock / Home reference composer sends canonical /api/files srcs. */
export interface StoredChatSession {
  id: number;
  name: string;
  messages: unknown[];
}

export interface OiaBridge {
  chatRun: (req: ChatRequest) => Promise<{ jobId: string; outcome: ChatOutcome }>;
  /** Streaming ChatEvents; the returned function unsubscribes. */
  onChatEvent: (cb: (ev: ChatEvent) => void) => () => void;
  cancelChat: (jobId: string) => Promise<boolean>;
  providerStatus: () => Promise<{
    image: { name: string; capabilities: { isMock: boolean; referenceImages: boolean } };
    llm: { name: string; capabilities: { isMock: boolean } };
    quota: { day: string; planner: number; image: number; limitHits: number; session: { planner: number; image: number } };
  }>;
  createProject: (p: {
    name?: string;
    scene?: unknown;
    pages?: unknown;
    width?: number;
    height?: number;
  }) => Promise<Project>;
  getProject: (id: string) => Promise<Project | null>;
  /** Recent projects, newest first (workspace + recent strip). */
  listProjects: () => Promise<Project[]>;
  /** Autosave — pages are strictly validated inside the store (projectSchema). */
  saveProject: (id: string, patch: { name?: string; pages?: unknown }) => Promise<Project | null>;
  removeProject: (id: string) => Promise<boolean>;
  /** Community templates from the local TemplateStore (published + shipped seeds). */
  listTemplates: () => Promise<Template[]>;
  createTemplate: (t: { name: string; authorName?: string; scene: unknown }) => Promise<Template>;
  listSessions: () => Promise<{ id: number; name: string; updatedAt: number }[]>;
  getSession: (id: number) => Promise<StoredChatSession | null>;
  /** Editor Assets panel / reference composer — bytes → LocalFileStore, canonical URL back. */
  uploadAsset: (name: string, bytes: Uint8Array) => Promise<{ url: string; size: number }>;
  /** Native save dialog + write — the desktop replacement for the browser download anchor. */
  saveExport: (fileName: string, bytes: Uint8Array) => Promise<{ saved: boolean; path: string | null }>;
}
