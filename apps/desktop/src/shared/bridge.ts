import type { ChatEvent, Project } from "@oia/schema";
import type { ChatRequest, ChatOutcome } from "@oia/services";

/**
 * The bridge contract — defined ONCE. preload implements it, the renderer consumes it,
 * and the request/response types come from @oia/services (no hand mirrors, no drift).
 * Channels live in ./ipc.ts; only the surface shape lives here.
 */
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
  createProject: (p: { name?: string; scene?: unknown }) => Promise<Project>;
  getProject: (id: string) => Promise<Project | null>;
}
