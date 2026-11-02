import { useCallback, useEffect, useState, Component, type ReactNode } from "react";
import { Home } from "./views/Home.js";
import { Editor, EditorErrorBoundary } from "./views/Editor.js";
import { Workspace } from "./views/Workspace.js";
import { Tools } from "./views/Tools.js";
import { BrandKit } from "./views/BrandKit.js";
import { Settings } from "./views/Settings.js";
import { Sidebar, type SectionName } from "./components/Sidebar.js";
import { CreateSheet } from "./components/CreateSheet.js";

/**
 * Renderer shell — UI v1.1 R1 (docs/designs/ui-v11-redesign.md): a left sidebar
 * (New design, sections, recent projects, runtime + usage status) and the active
 * view on a raised content sheet. Every "New" (sidebar, ⌘N, Projects) opens the
 * Create sheet (R2, UX-2). The Editor stays a fullscreen view of its own.
 * Each view owns its bridge subscriptions; switching views remounts them (keyed),
 * so streams never leak across views. For agents now lives under Settings.
 *
 * UI copy is English by owner decision (D8): Vietnamese is supported at the
 * content/font level only (banner text, Be Vietnam Pro), never in interface strings.
 */

type View =
  | { name: "home"; resumeSession?: number | null; focusComposer?: number; prompt?: string }
  | { name: "workspace"; deconFile?: File }
  | { name: "tools"; tool?: string }
  | { name: "brandkit" }
  | { name: "settings" }
  | { name: "editor"; projectId: string | null };

/** A renderer crash must never be a white window for a non-technical user. */
class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <main className="appShell">
          <div className="notice error" role="alert">
            The app hit a display error. Reopen the window and try again — your work is saved.
          </div>
        </main>
      );
    }
    return this.props.children;
  }
}
export { ErrorBoundary };

export default function App() {
  const [view, setView] = useState<View>({ name: "home" });
  // bumps when runtime settings change, so the sidebar status card re-reads
  const [statusRev, setStatusRev] = useState(0);
  const [createOpen, setCreateOpen] = useState(false);

  const openProject = (id: string) => { setCreateOpen(false); setView({ name: "editor", projectId: id }); };
  const openSession = (id: number) => setView({ name: "home", resumeSession: id });
  const newDesign = useCallback(() => setCreateOpen(true), []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "n" && view.name !== "editor") {
        e.preventDefault();
        newDesign();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [newDesign, view.name]);

  if (view.name === "editor") {
    return (
      <EditorErrorBoundary key={`ed-${view.projectId}`}>
        <Editor projectId={view.projectId} onExit={() => setView({ name: "home" })} onOpenProject={openProject} />
      </EditorErrorBoundary>
    );
  }

  const navigate = (name: SectionName) => setView({ name } as View);

  let body: ReactNode;
  switch (view.name) {
    case "workspace":
      body = <Workspace key={`ws-${view.deconFile?.name ?? ""}`} onOpenProject={openProject} onOpenSession={openSession} onNew={newDesign} initialDeconFile={view.deconFile} />;
      break;
    case "tools":
      body = <Tools key={`tools-${view.tool ?? ""}`} initialTool={view.tool ?? null} onOpenProject={openProject} />;
      break;
    case "brandkit":
      body = <BrandKit key="brandkit" onDesignWithKit={() => setView({ name: "home" })} />;
      break;
    case "settings":
      body = <Settings key="settings" onChanged={() => setStatusRev((n) => n + 1)} />;
      break;
    default:
      body = (
        <Home
          key={`home-${view.resumeSession ?? "new"}-${view.focusComposer ?? 0}`}
          resumeSession={view.resumeSession ?? null}
          autoFocus={Boolean(view.focusComposer)}
          initialPrompt={view.prompt}
          onOpenProject={openProject}
          onOpenSettings={() => setView({ name: "settings" })}
          onOpenTools={(slug) => setView(slug ? { name: "tools", tool: slug } : { name: "tools" })}
          onOpenProjects={() => setView({ name: "workspace" })}
        />
      );
  }

  return (
    <ErrorBoundary>
      <div className="viewFrame">
        <Sidebar key={statusRev} current={view.name} onNavigate={navigate} onNewDesign={newDesign} onOpenProject={openProject} />
        {body}
      </div>
      {createOpen && (
        <CreateSheet
          onClose={() => setCreateOpen(false)}
          onDescribe={(prompt) => { setCreateOpen(false); setView({ name: "home", focusComposer: Date.now(), prompt }); }}
          onOpenProject={openProject}
          onDeconstruct={(file) => { setCreateOpen(false); setView({ name: "workspace", deconFile: file }); }}
        />
      )}
    </ErrorBoundary>
  );
}
