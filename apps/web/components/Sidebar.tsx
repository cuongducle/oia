"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Dialog } from "./Dialog";
import { Home, LayoutGrid, Palette, Wrench, Bot, PanelLeftClose, PanelLeftOpen, HelpCircle, LockKeyhole, ArrowUpRight, X } from "lucide-react";

const NAV = [
  { href: "/", label: "Home", Icon: Home },
  { href: "/workspace", label: "Workspace", Icon: LayoutGrid },
  { href: "/brandkit", label: "Brand kit", Icon: Palette },
  { href: "/toolbox", label: "Toolbox", Icon: Wrench },
  { href: "/for-agents", label: "For Agents", Icon: Bot },
];
export function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  if (pathname.startsWith("/editor") || pathname.startsWith("/p/")) return null;
  return <>
    <aside className={`appSidebar ${collapsed ? "collapsed" : ""}`}>
      <div className="sidebarBrand">
        <Link href="/" className="wordmark" aria-label="Oia — Home">{collapsed ? "O" : <>O<span>ia</span></>}</Link>
        <button className="iconBtn collapseBtn" onClick={() => setCollapsed(!collapsed)} aria-label={collapsed ? "Expand navigation" : "Collapse navigation"}>
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>
      <nav aria-label="Main navigation">
        {NAV.map(({ href, label, Icon }) => <Link key={href} href={href} className={`navPill ${pathname === href ? "active" : ""}`} aria-current={pathname === href ? "page" : undefined} title={label}>
          <Icon size={18} strokeWidth={1.7} /><span>{label}</span>
        </Link>)}
      </nav>
      <div className="sidebarBottom">
        <Link href="/for-agents" className="sidebarConnection" title="BYOK connection guide">
          <LockKeyhole size={17} /><span>Connect BYOK</span><ArrowUpRight size={14} className="trailing" />
        </Link>
        <button className="sidebarConnection" onClick={() => setHelpOpen(true)} title="Help"><HelpCircle size={17} /><span>Help</span></button>
        <div className="sidebarFootnote">Open source. Your own space.</div>
      </div>
    </aside>
    {helpOpen && <Dialog onClose={() => setHelpOpen(false)} labelledBy="help-title">
        <div className="sectionHeading"><h2 id="help-title">Getting started with Oia</h2><button autoFocus className="iconBtn" onClick={() => setHelpOpen(false)} aria-label="Close help"><X size={18} /></button></div>
        <p>Describe an idea on Home or choose a template. Open the editor to refine every layer and export when you are ready.</p>
        <p>Oia uses the AI provider configured in your self-hosted instance. Connect automation tools through the API in For Agents.</p>
        <Link className="primaryBtn" href="/docs" onClick={() => setHelpOpen(false)}>Read the docs <ArrowUpRight size={15} /></Link>
    </Dialog>}
  </>;
}
