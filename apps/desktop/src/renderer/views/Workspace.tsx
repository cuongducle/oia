import { useEffect, useState } from "react";
import type { Project } from "@oia/schema";
import { ScenePreview } from "../components/ScenePreview.js";
import { Dialog } from "../components/Dialog.js";
import { oia, bridgeErrorMessage } from "../lib/bridge.js";
import { LIVE_ARTBOARDS, liveArtboardScene, type LiveArtboard } from "../lib/livestream-presets.js";
import { deconstructScene } from "../lib/deconstruct-scene.js";
import type { DeconstructText } from "@oia/schema";

/**
 * D2 renderer port — the workspace list over IPC: recent projects (ScenePreview
 * thumbnails) + recent conversations; create blank or import an image as a project.
 * UI copy is English by owner decision (content-level Vietnamese only).
 */

interface ChatRow { id: number; name: string; updatedAt: number }

export interface WorkspaceProps {
  onOpenProject: (id: string) => void;
  onOpenSession: (id: number) => void;
}

export function Workspace({ onOpenProject, onOpenSession }: WorkspaceProps) {
  const [chats, setChats] = useState<ChatRow[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [newMenu, setNewMenu] = useState(false);
  useEffect(() => {
    if (!newMenu) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setNewMenu(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newMenu]);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  // per-card management: rename (inline) + delete (confirm) — projects:save/remove over IPC
  const [renaming, setRenaming] = useState<Project | null>(null);
  const [renameName, setRenameName] = useState("");
  const [deleting, setDeleting] = useState<Project | null>(null);
  // reorg step 5 — web `.data` import (projects, conversations, assets, kits, templates)
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");

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

  function pickDeconFile(file: File) {
    const previewUrl = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => setDecon({ file, previewUrl, w: img.naturalWidth || 1360, h: img.naturalHeight || 2048 });
    img.onerror = () => { URL.revokeObjectURL(previewUrl); setError("That file could not be read as an image."); };
    img.src = previewUrl;
  }

  async function runDeconstruct() {
    if (!decon) return;
    setDeconBusy(true); setError(""); setNotice("");
    try {
      const up = await oia().uploadAsset(decon.file.name, new Uint8Array(await decon.file.arrayBuffer()));
      const started = await oia().submitTask("deconstruct", { fileUrl: up.url });
      let final = started.progress === "processing" ? null : started;
      for (let i = 0; i < 150 && !final; i++) { // 2s×150 = 5 min cap, then an honest error
        await new Promise((r) => setTimeout(r, 2000));
        const t = await oia().getTask(started.taskId);
        if (!t) throw new Error("task vanished");
        if (t.progress !== "processing") final = t;
      }
      if (!final) throw new Error("timed out after 5 minutes");
      if (final.progress !== "succeeded" || !final.taskResult?.download) {
        throw new Error(final.taskNote || final.msg || "deconstruct failed");
      }
      const texts = (final.taskResult.texts ?? []) as DeconstructText[];
      const scene = deconstructScene({ imageUrl: final.taskResult.download, w: decon.w, h: decon.h, texts });
      const p = await oia().createProject({ name: decon.file.name.replace(/\.[^.]+$/, "") || "Deconstructed design", scene });
      closeDecon();
      onOpenProject(p.id);
    } catch (e) {
      setError(bridgeErrorMessage(e, "Deconstruct failed — the design was not imported."));
    } finally {
      setDeconBusy(false);
    }
  }

  const importFromWeb = async () => {
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const counts = await oia().importWebData(""); // empty → main opens the native folder picker
      if (counts) {
        const parts = [
          counts.projects ? `${counts.projects} project${counts.projects === 1 ? "" : "s"}` : null,
          counts.sessions ? `${counts.sessions} conversation${counts.sessions === 1 ? "" : "s"}` : null,
          counts.assets ? `${counts.assets} image${counts.assets === 1 ? "" : "s"}` : null,
          counts.brandKits ? `${counts.brandKits} brand kit${counts.brandKits === 1 ? "" : "s"}` : null,
          counts.templates ? `${counts.templates} template${counts.templates === 1 ? "" : "s"}` : null,
        ].filter(Boolean);
        setNotice(parts.length ? `Imported ${parts.join(", ")}.` : "Nothing new to import — everything was already here.");
        const [c, p] = await Promise.all([oia().listSessions(), oia().listProjects()]);
        setChats(c);
        setProjects(p);
      }
    } catch (err) {
      setError(bridgeErrorMessage(err, "Import failed — check the folder and try again."));
    } finally {
      setImporting(false);
    }
  };

  useEffect(() => {
    void Promise.all([oia().listSessions(), oia().listProjects()])
      .then(([c, p]) => { setChats(c); setProjects(p); })
      .catch(() => setError("Could not load your workspace. Please reopen the page."))
      .finally(() => setLoading(false));
  }, []);

  async function create(file?: File) {
    setBusy(true); setError("");
    try {
      if (file) {
        // import → assetize → project whose first page is the image on a white clip
        const bytes = new Uint8Array(await file.arrayBuffer());
        const up = await oia().uploadAsset(file.name, bytes);
        const p = await oia().createProject({
          name: file.name,
          scene: { version: "6.9.1", objects: [
            { type: "Rect", name: "clip", left: 0, top: 0, width: 1360, height: 2048, fill: "white", selectable: false },
            { type: "Image", left: 0, top: 0, width: 1360, height: 2048, src: up.url, crossOrigin: "anonymous", selectable: true },
          ] },
        });
        onOpenProject(p.id);
        return;
      }
      const p = await oia().createProject({});
      onOpenProject(p.id);
    } catch (e) {
      setError(bridgeErrorMessage(e, "Could not create the project."));
    } finally { setBusy(false); }
  }

  /** C3 (LV-2): livestream artboard presets — clip-only scenes, no assets to map. */
  async function createLive(a: LiveArtboard) {
    setBusy(true); setError(""); setNewMenu(false);
    try {
      const p = await oia().createProject({ name: a.projectName, scene: liveArtboardScene(a) });
      onOpenProject(p.id);
    } catch (e) {
      setError(bridgeErrorMessage(e, "Could not create the project."));
    } finally { setBusy(false); }
  }

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
  const visibleProjects = projects.filter((p) => matches(p.name));
  const visibleChats = chats.filter((c) => matches(c.name));

  return (
    <main className="appShell workspaceView">
      <header className="sectionHeading">
        <div>
          <h1>Workspace</h1>
          <p>Pick up where inspiration left off.</p>
        </div>
        <div className="workspaceActions">
          <button className="secondaryBtn" disabled={importing || busy} onClick={() => void importFromWeb()} title="Bring projects, conversations and assets from a self-hosted web app's .data folder">
            {importing ? "Importing…" : "⤵ Import from web app"}
          </button>
          <label className="secondaryBtn">
            ⬆ New from image
            <input type="file" aria-label="New project from image" accept="image/*" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && create(e.target.files[0])} />
          </label>
          <label className="secondaryBtn" title="Import an old banner (Canva, ChatGPT…) — text becomes editable layers">
            ↯ New from old design
            <input type="file" aria-label="New project from an old design" accept="image/*" hidden disabled={busy || deconBusy} onChange={(e) => { if (e.target.files?.[0]) pickDeconFile(e.target.files[0]); e.target.value = ""; }} />
          </label>
          <div className="newMenuWrap">
            <button className="primaryBtn" disabled={busy} aria-expanded={newMenu} aria-haspopup="menu" onClick={() => setNewMenu((v) => !v)}>
              {busy ? "Creating…" : "＋ New project"}
            </button>
            {newMenu && (
              <>
                <button className="menuBackdrop" aria-label="Close menu" tabIndex={-1} onClick={() => setNewMenu(false)} />
                <div className="newMenu" role="menu">
                  <button role="menuitem" className="newMenuItem" disabled={busy} onClick={() => { setNewMenu(false); void create(); }}>
                    <strong>Blank canvas</strong>
                    <span>Portrait poster · 1360 × 2048</span>
                  </button>
                  {LIVE_ARTBOARDS.map((a) => (
                    <button key={a.id} role="menuitem" className="newMenuItem" disabled={busy} onClick={() => void createLive(a)}>
                      <strong>{a.label}{a.official ? " · official spec" : ""}</strong>
                      <span>{a.sub}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      </header>

      <label className="searchField">
        <span aria-hidden="true">🔎</span>
        <input aria-label="Search projects and conversations" placeholder="Search your workspace…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      {error && <p className="notice error" role="alert">{error}</p>}
      {notice && <p className="notice" role="status">{notice}</p>}

      {loading ? <p role="status" className="hintP" style={{ marginTop: 28 }}>Loading your workspace…</p> : (
        <>
          <section style={{ marginTop: 32 }}>
            <div className="sectionHeading">
              <h2>Your projects</h2>
              <span className="hintP">{visibleProjects.length} {visibleProjects.length === 1 ? "project" : "projects"}</span>
            </div>
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
                <h3>{query ? "No projects found" : "Room for your first idea"}</h3>
                <p>{query ? "Try a different search." : "Create something new or start from a template."}</p>
              </div>
            )}
          </section>

          <section style={{ marginTop: 36 }}>
            <div className="sectionHeading"><h2>Recent conversations</h2></div>
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
        </>
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
        <Dialog onClose={deconBusy ? () => {} : closeDecon} label="Deconstruct old design">
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
            <button className="secondaryBtn" disabled={deconBusy} onClick={closeDecon}>Cancel</button>
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
