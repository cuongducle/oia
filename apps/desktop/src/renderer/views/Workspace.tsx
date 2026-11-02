import { useEffect, useRef, useState } from "react";
import type { Project } from "@oia/schema";
import { ScenePreview } from "../components/ScenePreview.js";
import { Dialog } from "../components/Dialog.js";
import { oia, bridgeErrorMessage } from "../lib/bridge.js";
import { deconstructScene } from "../lib/deconstruct-scene.js";
import { pollTask } from "../lib/poll-task.js";
import { sceneDims, sceneShape, type SceneShape } from "../lib/scene-dims.js";
import type { DeconstructText } from "@oia/schema";

/**
 * Projects (UI v1.1 R2; the old Workspace): every project with shape filters, and
 * the AI history tab (recent conversations). Creating lives in the Create sheet
 * (UX-2) — "Make its text editable" lands here with the file, so the B1 confirm
 * dialog and its cancel/teardown rules stay exactly as they were. Web import
 * moved to Settings › Data.
 */

const FILTERS: { id: "all" | "samples" | SceneShape; label: string }[] = [
  { id: "all", label: "All" },
  { id: "samples", label: "Samples" },
  { id: "square", label: "Square" },
  { id: "portrait", label: "Portrait" },
  { id: "landscape", label: "Landscape" },
  { id: "916", label: "9:16" },
];

interface ChatRow { id: number; name: string; updatedAt: number }

export interface WorkspaceProps {
  onOpenProject: (id: string) => void;
  onOpenSession: (id: number) => void;
  /** Opens the Create sheet. */
  onNew: () => void;
  /** From the Create sheet's "Make its text editable" — opens the B1 confirm dialog. */
  initialDeconFile?: File;
}

export function Workspace({ onOpenProject, onOpenSession, onNew, initialDeconFile }: WorkspaceProps) {
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [tab, setTab] = useState<"projects" | "history">("projects");
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["id"]>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  // per-card management: rename (inline) + delete (confirm) — projects:save/remove over IPC
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleting, setDeleting] = useState<Project | null>(null);

  // ---- B1 deconstruct import (deconstruct-import.md DC-1) ----------------------
  interface DeconPick { file: File; previewUrl: string; w: number; h: number }
  const [decon, setDecon] = useState<DeconPick | null>(null);
  const [deconBusy, setDeconBusy] = useState(false);
  const [imageMock, setImageMock] = useState<boolean | null>(null);
  useEffect(() => {
    oia().providerStatus().then((s) => setImageMock(Boolean(s.image.capabilities.isMock))).catch(() => setImageMock(null));
  }, []);

  function closeDecon() {
    if (decon?.previewUrl) URL.revokeObjectURL(decon.previewUrl);
    setDecon(null);
  }
  useEffect(() => { if (initialDeconFile) pickDeconFile(initialDeconFile); }, [initialDeconFile]); // eslint-disable-line react-hooks/exhaustive-deps
  // teardown B1: the preview object URL must die on unmount too, not just on close
  useEffect(() => () => { if (decon?.previewUrl) URL.revokeObjectURL(decon.previewUrl); }, [decon]);

  function pickDeconFile(file: File) {
    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setDecon({ file, previewUrl, w: img.naturalWidth || 1360, h: img.naturalHeight || 2048 });
    img.onerror = () => { URL.revokeObjectURL(previewUrl); setError("That file could not be read as an image."); };
    img.src = previewUrl;
  }

  const deconTaskRef = useRef<string | null>(null);
  const deconRunRef = useRef(0);
  /** Teardown B1 (spec deviation): "cancel is always available" — the run must
   * be cancellable mid-flight. Cancelling closes the dialog, but the poll loop
   * KEEPS WATCHING: if the task had already finished, the paid result still
   * becomes a project (quota-is-money — no orphaned paid generation). */
  async function cancelDecon() {
    const id = deconTaskRef.current;
    if (id) await oia().cancelTask(id).catch(() => {});
    closeDecon();
  }

  async function runDeconstruct() {
    if (!decon) return;
    // snapshot: cancel() nulls `decon` mid-run, but a task that SUCCEEDED before
    // the cancel landed still owes the seller its project (quota-is-money) — the
    // success path must not depend on live dialog state.
    const pick = decon;
    const myRun = ++deconRunRef.current;
    setDeconBusy(true); setError("");
    try {
      const up = await oia().uploadAsset(pick.file.name, new Uint8Array(await pick.file.arrayBuffer()));
      const started = await oia().submitTask("deconstruct", { fileUrl: up.url });
      deconTaskRef.current = started.taskId;
      const final = await pollTask(started, { get: (id) => oia().getTask(id) });
      if (final.progress !== "succeeded" || !final.taskResult?.download) {
        throw new Error(final.taskNote || final.msg || (final.progress === "failed" ? "deconstruct failed" : "deconstruct was cancelled — nothing was imported"));
      }
      const texts = (final.taskResult.texts ?? []) as DeconstructText[];
      const scene = deconstructScene({ imageUrl: final.taskResult.download, w: pick.w, h: pick.h, texts });
      const p = await oia().createProject({ name: pick.file.name.replace(/\.[^.]+$/, "") || "Deconstructed design", scene });
      if (deconRunRef.current !== myRun) return; // a newer run owns the UI — the project stays in the workspace list
      closeDecon();
      onOpenProject(p.id);
    } catch (e) {
      setError(bridgeErrorMessage(e, "Deconstruct failed — the design was not imported."));
    } finally {
      deconTaskRef.current = null;
      setDeconBusy(false);
    }
  }


  useEffect(() => {
    void Promise.all([oia().listSessions(), oia().listProjects()])
      .then(([c, p]) => { setChats(c); setProjects(p); })
      .catch(() => setError("Could not load your workspace. Please reopen the page."))
      .finally(() => setLoading(false));
  }, []);



  async function rename() {
    if (!renaming || !renameName.trim()) { setRenaming(null); return; }
    try {
      await oia().saveProject(renaming.id, { name: renameName.trim().slice(0, 120) });
      setProjects((ps) => ps.map((p) => (p.id === renaming.id ? { ...p, name: renameName.trim().slice(0, 120) } : p)));
    } catch (e) {
      setError(bridgeErrorMessage(e, "Could not rename the project."));
    } finally {
      setRenaming(null);
    }
  }
  async function remove() {
    if (!deleting) return;
    const id = deleting.id;
    try {
      await oia().removeProject(id);
      setProjects((ps) => ps.filter((p) => p.id !== id));
    } catch (e) {
      setError(bridgeErrorMessage(e, "Could not delete the project."));
    } finally {
      setDeleting(null);
    }
  }

  const matches = (name: string) => name.toLocaleLowerCase("vi").includes(query.trim().toLocaleLowerCase("vi"));
  const inFilter = (p: Project) => {
    if (filter === "all") return true;
    if (filter === "samples") return Boolean(p.sample);
    if (!p.pages[0]) return false;
    const { w, h } = sceneDims(p.pages[0].canvas);
    return sceneShape(w, h) === filter;
  };
  const visibleProjects = projects.filter((p) => matches(p.name) && inFilter(p));
  const visibleChats = chats.filter((c) => matches(c.name));

  return (
    <main className="appShell workspaceView">
      <header className="projectsHead">
        <h1>Projects</h1>
        <label className="searchField">
          <span aria-hidden="true">⌕</span>
          <input aria-label="Search projects and conversations" placeholder="Search…" value={query} onChange={(e) => setQuery(e.target.value)} />
        </label>
        <div className="workspaceActions">
          <button className="primaryBtn" data-testid="projects-new" onClick={onNew}>＋ New</button>
        </div>
      </header>

      <div className="projectsBar">
        <div className="segmented" role="tablist" aria-label="Projects or AI history">
          <button role="tab" aria-selected={tab === "projects"} className={tab === "projects" ? "active" : ""} onClick={() => setTab("projects")}>Projects</button>
          <button role="tab" aria-selected={tab === "history"} className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>AI history</button>
        </div>
        {tab === "projects" && (
          <div className="filterChips" aria-label="Filter projects">
            {FILTERS.map((f) => (
              <button key={f.id} className={`filterChip ${filter === f.id ? "active" : ""}`} aria-pressed={filter === f.id} onClick={() => setFilter(f.id)}>{f.label}</button>
            ))}
          </div>
        )}
      </div>

      {error && <p className="notice error" role="alert">{error}</p>}

      {loading ? <p role="status" className="hintP" style={{ marginTop: 28 }}>Loading your projects…</p> : tab === "projects" ? (
        <section style={{ marginTop: 20 }} aria-label="Your projects">
          <div className="projectGrid">
            {visibleProjects.map((p) => (
              <article key={p.id} data-sample={p.sample ? "true" : undefined}>
                <button className="projectPreview" aria-label={`Open ${p.name}`} onClick={() => onOpenProject(p.id)}>
                  {p.pages[0] && <ScenePreview scene={p.pages[0].canvas as never} label={p.name} />}
                </button>
                <div className="projectMeta">
                  <div className="projectMetaName">
                    <strong title={p.name}>{p.sample && <em className="sampleBadge">Sample</em>}{p.name}</strong>
                    <small>{timeAgo(p.updatedAt ?? Date.now())} · {p.pages.length} {p.pages.length === 1 ? "page" : "pages"}</small>
                  </div>
                  <div className="projectMetaActions">
                    <button className="iconBtn" aria-label={`Rename ${p.name}`} title="Rename" onClick={() => { setRenaming(p); setRenameName(p.name); }}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg></button>
                    <button className="iconBtn danger" aria-label={`Delete ${p.name}`} title="Delete" onClick={() => setDeleting(p)}><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" /></svg></button>
                  </div>
                </div>
              </article>
            ))}
          </div>
          {visibleProjects.length === 0 && (
            <div className="emptyState">
              <h3>{query || filter !== "all" ? "No projects found" : "Room for your first idea"}</h3>
              <p>{query || filter !== "all" ? "Try a different search or filter." : "Create something new or start from a template."}</p>
            </div>
          )}
        </section>
      ) : (
        <section style={{ marginTop: 20 }} aria-label="AI history">
          <div className="chatGrid">
            {visibleChats.map((c) => (
              <button key={c.id} className="chatCard" onClick={() => onOpenSession(c.id)}>
                <strong>{c.name}</strong>
                <span>{timeAgo(c.updatedAt)}</span>
              </button>
            ))}
          </div>
          {visibleChats.length === 0 && <p className="hintP">{query ? "No matching conversations." : "Your conversations with the assistant will appear here."}</p>}
        </section>
      )}

      {renaming && (
        <Dialog onClose={() => setRenaming(null)} label="Rename project">
          <h2>Rename project</h2>
          <label htmlFor="rename-input" style={{ fontSize: 12, display: "block", margin: "16px 0 8px" }}>Project name</label>
          <input id="rename-input" value={renameName} maxLength={120} onChange={(e) => setRenameName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") void rename(); }} />
          <div className="dialogActions">
            <button className="secondaryBtn" onClick={() => setRenaming(null)}>Cancel</button>
            <button className="primaryBtn" disabled={!renameName.trim()} onClick={() => void rename()}>Save name</button>
          </div>
        </Dialog>
      )}
      {deleting && (
        <Dialog onClose={() => setDeleting(null)} label="Delete project">
          <h2>Delete project?</h2>
          <p>“{deleting.name}” and its pages will be removed from this app. This cannot be undone.</p>
          <div className="dialogActions">
            <button className="secondaryBtn" onClick={() => setDeleting(null)}>Keep it</button>
            <button className="primaryBtn danger" onClick={() => void remove()}>Delete</button>
          </div>
        </Dialog>
      )}
      {decon && (
        <Dialog onClose={deconBusy ? () => void cancelDecon() : closeDecon} label="Deconstruct old design">
          <h2>Make this design editable?</h2>
          <p style={{ fontSize: 13, color: "var(--muted)", margin: "4px 0 12px" }}>
            Oia reads the text in the image, cleans it off the background, and rebuilds each line as an editable text layer.
            Everything else stays a flat image — objects are not separated.
          </p>
          <div className="deconPreview">
            <img src={decon.previewUrl} alt="Old design preview" />
            <div>
              <strong>{decon.file.name}</strong>
              <span>{decon.w} × {decon.h}</span>
              {imageMock === false && <span data-testid="decon-cost">≈ 1 image + 1 read</span>}
            </div>
          </div>
          {deconBusy && <p role="status" style={{ fontSize: 12.5 }}>Reading and cleaning — this usually takes 1–3 minutes…</p>}
          <div className="dialogActions">
            <button className="secondaryBtn" onClick={() => void cancelDecon()}>{deconBusy ? "Cancel run" : "Cancel"}</button>
            <button className="primaryBtn" disabled={deconBusy} data-testid="decon-confirm" onClick={() => void runDeconstruct()}>
              {deconBusy ? "Working…" : "Deconstruct"}
            </button>
          </div>
        </Dialog>
      )}
    </main>
  );
}

function timeAgo(ts: number) {
  const m = Math.max(0, Math.floor((Date.now() - ts) / 60000));
  if (m < 1) return "Just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return h < 24 ? `${h} hr ago` : `${Math.floor(h / 24)} days ago`;
}
