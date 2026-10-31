import type { ChatEvent, Project, Template, TaskStatus, BrandKit } from "@oia/schema";
import type { ChatRequest, ChatRunResult } from "@oia/services";
import type { RuntimeStatus, InstallProgress } from "@oia/providers";
import type { RuntimeModeChoice } from "./ipc.js";
import type { ApiKeyRecord, WebImportCounts } from "@oia/tasks";

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

/** TP-D3 — runtime snapshot the panel renders: engine health + the shell's provider choice. */
export interface RuntimeSnapshot {
  runtime: RuntimeStatus;
  /** The persisted user choice. */
  providersMode: RuntimeModeChoice;
  /** What the running context actually uses ("auto" resolved at boot). */
  effective: "mock" | "codex";
}

/** A brand-kit draft crossing the bridge: id/createdAt are store-assigned on create. */
export type BrandKitInput = Omit<BrandKit, "id" | "createdAt"> & { id?: string; createdAt?: number };

/** TP-D3 — one-way progress frames for the long-running runtime flows. */
export type RuntimeEvent =
  | { type: "install"; phase: InstallProgress["phase"]; pct?: number; detail?: string }
  | { type: "login-url"; url: string }
  | { type: "login-phase"; phase: "starting" | "url" | "exchanging"; detail?: string };

/** For Agents — the loopback endpoint the skills talk to (127.0.0.1, key-authed). */
export interface AgentApiStatus {
  port: number | null;
  /** Job frames seen since app start, newest first (cap ~50, main-side ring). */
  recentJobs: (AgentJobFrame & { at: number })[];
}

/** One metered-run lifecycle frame. `lane` tells agent-API runs from quick-tools
 *  runs — both burn quota, both must be visible somewhere in the UI (hard rule 6). */
export interface AgentJobFrame {
  taskId: string;
  event: "submitted" | "succeeded" | "failed";
  taskType: string;
  lane: "agent" | "tool";
}

export interface OiaBridge {
  /** Return type IS `ChatRunResult` from @oia/services — no hand mirror (the
   * `sessionId` field is the A1 preview-apply conversation pin). */
  chatRun: (req: ChatRequest) => Promise<ChatRunResult>;
  /** Streaming ChatEvents; the returned function unsubscribes. */
  onChatEvent: (cb: (ev: ChatEvent) => void) => () => void;
  cancelChat: (jobId: string) => Promise<boolean>;
  providerStatus: () => Promise<{
    image: { name: string; capabilities: { isMock: boolean; referenceImages: boolean } };
    llm: { name: string; capabilities: { isMock: boolean } };
    quota: { day: string; planner: number; image: number; limitHits: number; session: { planner: number; image: number }; limits: { planner: number | null; image: number | null } };
    /** B7 — stores whose LAST disk write failed (basename only). Empty = all durable. */
    persistence: { file: string; error: string; code: string | null; failedWrites: number }[];
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
  /** ---- reorg step 4c: quick tools task lane (web /api/tasks, ported to IPC). ----
   * Background mode (noWait:false) + poll: the submit RPC returns immediately, so a
   * 1–6 min generation never sits on one long-lived call (and stays cancellable). */
  submitTask: (type: string, params: Record<string, unknown>) => Promise<TaskStatus>;
  /** Terminal record, or null when unknown/expired (24h TTL — the web 404). */
  getTask: (taskId: string) => Promise<TaskStatus | null>;
  cancelTask: (taskId: string) => Promise<boolean>;
  /** ---- reorg step 4d: brand kits + For Agents ---- */
  listBrandKits: () => Promise<BrandKit[]>;
  upsertBrandKit: (input: BrandKitInput) => Promise<BrandKit>;
  removeBrandKit: (id: string) => Promise<boolean>;
  listApiKeys: () => Promise<ApiKeyRecord[]>;
  createApiKey: (name: string, ttlDays: number | null) => Promise<{ record: ApiKeyRecord; plaintext: string }>;
  revokeApiKey: (id: string) => Promise<boolean>;
  /** Loopback agent API endpoint state (port re-rolls on every utility fork). */
  agentStatus: () => Promise<AgentApiStatus>;
  /** Live job lifecycle (agent + tool lanes), buffered in main + streamed. */
  onAgentJob: (cb: (ev: AgentJobFrame) => void) => () => void;
  /** Clipboard via MAIN — the renderer's navigator.clipboard is denied by the F2
   *  deny-all permission handler (Electron maps it to clipboard-sanitized-write);
   *  this must never silently no-op like a swallowed catch. */
  copyText: (text: string) => Promise<boolean>;
  /** Reorg step 5 — import a self-hosted web app's .data directory. An empty
   *  sourceDir opens the native folder picker; resolving to null = user canceled. */
  importWebData: (sourceDir: string) => Promise<WebImportCounts | null>;
  /** TP-D3 — codex runtime management (the zero-terminal onboarding surface). */
  runtimeStatus: () => Promise<RuntimeSnapshot>;
  runtimeInstall: () => Promise<{ runtime: RuntimeStatus }>;
  runtimeLogin: () => Promise<{ ok: boolean; runtime: RuntimeStatus }>;
  runtimeLogout: () => Promise<{ runtime: RuntimeStatus }>;
  runtimeSetMode: (mode: RuntimeModeChoice) => Promise<RuntimeSnapshot>;
  /** Cancel the in-flight install/login (warned: interrupting login logs the user out). */
  runtimeCancel: () => Promise<boolean>;
  onRuntimeEvent: (cb: (ev: RuntimeEvent) => void) => () => void;
}
