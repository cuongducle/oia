import { useState, Component, type ReactNode } from "react";
import { Home } from "./views/Home.js";
import { Editor, EditorErrorBoundary } from "./views/Editor.js";
import { Workspace } from "./views/Workspace.js";
import { Tools } from "./views/Tools.js";
import { BrandKit } from "./views/BrandKit.js";
import { ForAgents } from "./views/ForAgents.js";

/**
 * D2 renderer shell — view routing: Home composer / Workspace / Tools (quick
 * tools, reorg 4c) / Brand kit + For agents (reorg 4d) / fullscreen Editor. Each
 * view owns its bridge subscriptions; switching views remounts them (keyed), so
 * streams never leak across views.
 *
 * UI copy is English by owner decision (design doc, D2 remainder): Vietnamese is
 * supported at the content/font level only (banner text, Be Vietnam Pro), never in
 * interface strings.
 */

type View =
  | { name: "home"; resumeSession?: number | null }
  | { name: "workspace" }
  | { name: "tools" }
  | { name: "brandkit" }
  | { name: "agents" }
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
        <Editor projectId={view.projectId} onExit={() => setView({ name: "home" })} onOpenSession={openSession} onOpenProject={openProject} />
      </EditorErrorBoundary>
    );
  }

  const nav = (
    <nav className="viewNav" aria-label="App sections">
      <span className="wordmark" aria-hidden="true">oia<span>.</span></span>
      <button className={`navPill ${view.name === "home" ? "active" : ""}`} onClick={() => setView({ name: "home" })} aria-current={view.name === "home" ? "page" : undefined}>Home</button>
      <button className={`navPill ${view.name === "workspace" ? "active" : ""}`} onClick={() => setView({ name: "workspace" })} aria-current={view.name === "workspace" ? "page" : undefined}>Workspace</button>
      <button className={`navPill ${view.name === "tools" ? "active" : ""}`} onClick={() => setView({ name: "tools" })} aria-current={view.name === "tools" ? "page" : undefined}>Tools</button>
      <button className={`navPill ${view.name === "brandkit" ? "active" : ""}`} onClick={() => setView({ name: "brandkit" })} aria-current={view.name === "brandkit" ? "page" : undefined}>Brand kit</button>
      <button className={`navPill ${view.name === "agents" ? "active" : ""}`} onClick={() => setView({ name: "agents" })} aria-current={view.name === "agents" ? "page" : undefined}>For agents</button>
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

  if (view.name === "tools") {
    return (
      <ErrorBoundary>
        <div className="viewFrame">
          {nav}
          <Tools key="tools" onOpenProject={openProject} />
        </div>
      </ErrorBoundary>
    );
  }

  if (view.name === "brandkit") {
    return (
      <ErrorBoundary>
        <div className="viewFrame">
          {nav}
          <BrandKit key="brandkit" onDesignWithKit={() => setView({ name: "home" })} />
        </div>
      </ErrorBoundary>
    );
  }

  if (view.name === "agents") {
    return (
      <ErrorBoundary>
        <div className="viewFrame">
          {nav}
          <ForAgents key="agents" />
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
