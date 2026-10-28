"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ExternalLink, Copy, Trash2 } from "lucide-react";

interface KeyRow { id: string; name: string; preview: string; createdAt: number; expiresAt: number | null }

export default function ForAgents() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [newName, setNewName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [baseUrl, setBaseUrl] = useState("");
  const [ttlDays, setTtlDays] = useState<string>("");

  useEffect(() => {
    setBaseUrl(`${window.location.origin}/api`);
    void refresh();
  }, []);

  async function refresh() {
    const j = await (await fetch("/api/api-key")).json();
    if (j.code === 0) setKeys(j.data);
  }
  async function createKey() {
    setBusy(true);
    try {
      const j = await (await fetch("/api/api-key", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name: newName, ttlDays: ttlDays ? Number(ttlDays) : null }) })).json();
      if (j.code === 0) {
        setFreshKey(j.data.plaintext);
        setNewName("");
        await refresh();
      }
    } finally { setBusy(false); }
  }
  async function revoke(id: string) {
    await fetch(`/api/api-key?id=${id}`, { method: "DELETE" });
    await refresh();
  }

  const [tab, setTab] = useState<"api" | "skills">("api");

  return (
    <main className="stub">
      <header className="sectionHeading"><div><h1>For Agents</h1><p>Bring Oia into your automation workflow.</p></div></header>
      <div className="tabs" style={{ marginBottom: 26 }}>
        <button className={tab === "api" ? "tabBtn active" : "tabBtn"} onClick={() => setTab("api")}>API management</button>
        <button className={tab === "skills" ? "tabBtn active" : "tabBtn"} onClick={() => setTab("skills")}>Skills</button>
      </div>

      {tab === "skills" && (
        <section>
          <h3>Agent Skills (SKILL.md)</h3>
          <p className="hintP">Install in ~/.claude/skills (or .agents/skills, .cursor/skills…):</p>
          <pre style={{ background: "#18181b", color: "#f4f4f5", padding: 14, borderRadius: 12, fontSize: 12, overflowX: "auto" }}>
{`cp -r packages/skills/skills/oia-* ~/.claude/skills/
export OIA_BASE_URL=${baseUrl}
export OIA_API_KEY=${"<your-key>"}`}</pre>
          <Link href="/docs" style={{ color: "#7c3aed", fontSize: 13 }}>Full API Reference →</Link>
        </section>
      )}

      {tab === "api" && (
      <>
      <section className="surface apiSection">
        <h3>API keys</h3>
        <p className="hintP">API keys can access your projects. Keep them private and never expose them in frontend code. <Link href="/docs" style={{ color: "#7c3aed" }}>API reference <ExternalLink size={11} style={{ display: "inline" }} /></Link></p>
        <div className="apiKeyForm">
          <input value={newName} aria-label="API key name" placeholder="Key name, e.g. claude-code" onChange={(e) => setNewName(e.target.value)}
            style={{ padding: 10, border: "1px solid var(--line)", borderRadius: 8 }} />
          <select aria-label="API key expiration" value={ttlDays} onChange={(e) => setTtlDays(e.target.value)} style={{ padding: 10, border: "1px solid var(--line)", borderRadius: 8 }}>
            <option value="">No expiration</option>
            <option value="30">30 days</option><option value="90">90 days</option><option value="365">365 days</option>
          </select>
          <button className="primaryBtn" onClick={createKey} disabled={busy || !newName.trim()}>Create key</button>
        </div>

        {freshKey && (
          <div style={{ background: "#f0fdf4", border: "1px solid #86efac", borderRadius: 10, padding: 12, margin: "10px 0" }}>
            <b>Your new key (shown only once):</b>
            <div style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 6 }}>
              <code style={{ fontSize: 13 }}>{freshKey}</code>
              <button className="iconBtn" aria-label="Copy new API key" onClick={() => { navigator.clipboard.writeText(freshKey); }}><Copy size={15}/></button>
            </div>
          </div>
        )}

        {keys.length > 0 ? <div className="tableScroll"><table style={{ width: "100%", borderCollapse: "collapse", marginTop: 20, fontSize: 12 }}>
          <thead>
            <tr style={{ textAlign: "left", borderBottom: "1px solid var(--line)" }}>
              <th style={{ padding: 8, width: 28 }}>#</th><th>Name</th><th>Key</th><th>Created</th><th>Expires</th><th><span className="hintP">Actions</span></th>
            </tr>
          </thead>
          <tbody>
            {keys.map((k, i) => (
              <tr key={k.id} style={{ borderBottom: "1px solid var(--line)" }}>
                <td style={{ padding: 8, color: "var(--muted)" }}>{i + 1}</td>
                <td style={{ padding: 8 }}>{k.name}</td>
                <td><code>{k.preview}…</code></td>
                <td>{new Date(k.createdAt).toLocaleDateString("en-US")}</td>
                <td>{k.expiresAt ? new Date(k.expiresAt).toLocaleDateString("en-US") : "—"}</td>
                <td><button className="iconBtn" aria-label={`Revoke key ${k.name}`} title="Revoke key" onClick={() => { if(confirm(`Revoke key “${k.name}”?`)) void revoke(k.id); }}><Trash2 size={15}/></button></td>
              </tr>
            ))}
          </tbody>
        </table></div> : <div className="emptyState" style={{marginTop:24}}>No API keys yet. Create a key to connect your tools.</div>}
      </section>

      <section style={{ marginTop: 28 }}>
        <h3>Base URL</h3>
        <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
          <code style={{ background: "#fff", border: "1px solid var(--line)", padding: "8px 12px", borderRadius: 8, fontSize: 13 }}>{baseUrl}</code>
          <button className="iconBtn" aria-label="Copy base URL" onClick={() => navigator.clipboard.writeText(baseUrl)}><Copy size={15}/></button>
        </div>
        <p className="hintP" style={{ marginTop: 8 }}>
          Tasks: <code>POST /tasks/[type]</code> · <code>GET /tasks/[taskId]</code> · Upload: <code>POST /upload/chunk-init → /upload/chunk → /upload/chunk-complete</code>
          <br />Header: <code>authorization: pf-…</code> · Envelope: <code>{"{code:0, data, msg}"}</code> · Task TTL 24h
        </p>
      </section>

      <section style={{ marginTop: 28 }}>
        <h3>Skills</h3>
        <p className="hintP">
          Install agent skills (SKILL.md): copy <code>packages/skills/skills/oia-*</code> into <code>~/.claude/skills/</code> (or the equivalent directory),
          set <code>OIA_BASE_URL={baseUrl}</code> + <code>OIA_API_KEY</code>.
        </p>
      </section>
      </>
      )}
    </main>
  );
}
