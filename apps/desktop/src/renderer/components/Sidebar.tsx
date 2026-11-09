import { useEffect, useState, type ReactNode } from "react";
import type { Project } from "@oia/schema";
import { oia } from "../lib/bridge.js";
import { ScenePreview } from "./ScenePreview.js";
import { Icons } from "./icons.js";
import { runtimeStatusLine, type StatusTone } from "../lib/runtime-status.js";

/**
 * UI v1.1 R1: the app shell sidebar: New design, the main sections, the three most
 * recent projects, and a status card that carries the infrastructure the Home hero
 * used to show (runtime state + today's image usage). Clicking the card opens Settings.
 */

export type SectionName = "home" | "workspace" | "tools" | "brandkit" | "settings";

const SECTIONS: { name: Exclude<SectionName, "settings">; label: string; icon: ReactNode }[] = [
  { name: "home", label: "Home", icon: Icons.home },
  { name: "workspace", label: "Projects", icon: Icons.projects },
  { name: "tools", label: "Tools", icon: Icons.tools },
  { name: "brandkit", label: "Brand kits", icon: Icons.brand },
];

interface Props {
  current: SectionName;
  onNavigate: (name: SectionName) => void;
  onNewDesign: () => void;
  onOpenProject: (id: string) => void;
}

interface Status {
  tone: StatusTone;
  title: string;
  detail: string;
  images: number;
  imageLimit: number | null;
}

export function Sidebar({ current, onNavigate, onNewDesign, onOpenProject }: Props) {
  const [recent, setRecent] = useState<Project[]>([]);
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    void oia().listProjects().then((p) => setRecent(p.slice(0, 3))).catch(() => {});
    void Promise.all([oia().runtimeStatus(), oia().providerStatus()])
      .then(([rt, ps]) => {
        const line = runtimeStatusLine(rt, ps.image.capabilities.isMock);
        setStatus({ ...line, images: ps.quota.image, imageLimit: ps.quota.limits.image });
      })
      .catch(() => {});
  }, [current]);

  const usagePct = status?.imageLimit ? Math.min(100, Math.round((status.images / status.imageLimit) * 100)) : null;

  return (
    <aside className="appSidebar" aria-label="App">
      <div className="sidebarHead">
        <span className="wordmark" aria-hidden="true">oia<span>.</span></span>
        <span className="version">v1.1</span>
      </div>
      <button className="newDesignBtn" data-testid="new-design" onClick={onNewDesign}>
        {Icons.plus}<span className="label">New design</span><kbd>{navigator.platform.startsWith("Mac") ? "⌘N" : "Ctrl N"}</kbd>
      </button>
      <nav className="viewNav" aria-label="App sections">
        {SECTIONS.map((s) => (
          <button key={s.name} className={`navPill ${current === s.name ? "active" : ""}`} aria-current={current === s.name ? "page" : undefined} onClick={() => onNavigate(s.name)}>
            {s.icon}{s.label}
          </button>
        ))}
      </nav>

      {recent.length > 0 && (
        <>
          <div className="sidebarSection">Recent</div>
          {recent.map((p) => (
            <button key={p.id} className="recentItem" onClick={() => onOpenProject(p.id)} title={p.name}>
              <span className="recentThumb">{p.pages[0] && <ScenePreview scene={p.pages[0].canvas} label="" />}</span>
              <span className="recentName">{p.name}</span>
            </button>
          ))}
        </>
      )}

      <div className="sidebarSpacer" />
      {status && (
        <button className="statusCard" data-testid="status-card" onClick={() => onNavigate("settings")} aria-label={`${status.title}. Open settings`}>
          <span className="statusLine"><span className={`statusDot ${status.tone}`} /><b>{status.title}</b><span className="statusDetail">{status.detail}</span></span>
          <span className="usageLine"><span>Images today</span><b>{status.images}{status.imageLimit !== null ? ` / ${status.imageLimit}` : ""}</b></span>
          {usagePct !== null && <span className={`usageBar ${usagePct >= 100 ? "full" : ""}`}><span style={{ width: `${usagePct}%` }} /></span>}
        </button>
      )}
      <nav className="viewNav" aria-label="Settings" style={{ marginTop: 6 }}>
        <button className={`navPill ${current === "settings" ? "active" : ""}`} aria-current={current === "settings" ? "page" : undefined} onClick={() => onNavigate("settings")}>
          {Icons.settings}Settings
        </button>
      </nav>
    </aside>
  );
}
