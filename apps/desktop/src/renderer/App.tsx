import { useState, Component, type ReactNode } from "react";
import { Home } from "./views/Home.js";
import { Editor, EditorErrorBoundary } from "./views/Editor.js";
import { Workspace } from "./views/Workspace.js";

/**
 * D2 renderer shell — view routing for the banner lane (Home composer / Workspace /
 * fullscreen Editor). Each view owns its bridge subscriptions; switching views
 * remounts them (keyed), so streams never leak across views.
 *
 * UI copy is English by owner decision (design doc, D2 remainder): Vietnamese is
 * supported at the content/font level only (banner text, Be Vietnam Pro), never in
 * interface strings.
 */

type View =
  | { name: "home"; resumeSession?: number | null }
  | { name: "workspace" }
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

  const openProject = (id: string) => setView({ name: "editor", projectId: id });
  const openSession = (id: number) => setView({ name: "home", resumeSession: id });

  if (view.name === "editor") {
    return (
      <EditorErrorBoundary key={`ed-${view.projectId}`}>
        <Editor projectId={view.projectId} onExit={() => setView({ name: "home" })} onOpenSession={openSession} />
      </EditorErrorBoundary>
    );
  }

  const nav = (
    <nav className="viewNav" aria-label="App sections">
      <button className={`navPill ${view.name === "home" ? "active" : ""}`} onClick={() => setView({ name: "home" })} aria-current={view.name === "home" ? "page" : undefined}>Home</button>
      <button className={`navPill ${view.name === "workspace" ? "active" : ""}`} onClick={() => setView({ name: "workspace" })} aria-current={view.name === "workspace" ? "page" : undefined}>Workspace</button>
    </nav>
  );

  if (view.name === "workspace") {
    return (
      <ErrorBoundary>
        <div className="viewFrame">
          {nav}
          <Workspace key="ws" onOpenProject={openProject} onOpenSession={openSession} />
        </div>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="viewFrame">
        {nav}
        <Home key={`home-${view.resumeSession ?? "new"}`} resumeSession={view.resumeSession ?? null} onOpenProject={openProject} />
      </div>
    </ErrorBoundary>
  );
}
