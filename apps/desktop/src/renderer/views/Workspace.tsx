import { useEffect, useState } from "react";
import type { Project } from "@oia/schema";
import { ScenePreview } from "../components/ScenePreview.js";
import { oia, bridgeErrorMessage } from "../lib/bridge.js";

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
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");

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
          <label className="secondaryBtn">
            ⬆ Import image
            <input type="file" aria-label="Import image" accept="image/*" hidden disabled={busy} onChange={(e) => e.target.files?.[0] && create(e.target.files[0])} />
          </label>
          <button className="primaryBtn" disabled={busy} onClick={() => create()}>
            {busy ? "Creating…" : "＋ New project"}
          </button>
        </div>
      </header>

      <label className="searchField">
        <span aria-hidden="true">🔎</span>
        <input aria-label="Search projects and conversations" placeholder="Search your workspace…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </label>

      {error && <p className="notice error" role="alert">{error}</p>}

      {loading ? <p role="status" className="hintP" style={{ marginTop: 28 }}>Loading your workspace…</p> : (
        <>
          <section style={{ marginTop: 32 }}>
            <div className="sectionHeading">
              <h2>Your projects</h2>
              <span className="hintP">{visibleProjects.length} {visibleProjects.length === 1 ? "project" : "projects"}</span>
            </div>
            <div className="projectGrid">
              {visibleProjects.map((p) => (
                <article key={p.id}>
                  <button className="projectPreview" aria-label={`Open ${p.name}`} onClick={() => onOpenProject(p.id)}>
                    {p.pages[0] && <ScenePreview scene={p.pages[0].canvas as never} label={p.name} />}
                  </button>
                  <div className="projectMeta">
                    <div>
                      <strong>{p.name}</strong>
                      <small>{timeAgo(p.updatedAt ?? Date.now())} · {p.pages.length} {p.pages.length === 1 ? "page" : "pages"}</small>
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
