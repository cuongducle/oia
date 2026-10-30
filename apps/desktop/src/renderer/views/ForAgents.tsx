import { useEffect, useState } from "react";
import { oia } from "../lib/bridge.js";
import type { AgentJobFrame } from "../../shared/bridge.js";

/**
 * reorg step 4d — For Agents (web /for-agents ported): API keys for the loopback
 * agent API (create/view/revoke; plaintext shown ONCE), the live base URL (the
 * port re-rolls on every utility fork), and the agent-job feed (main buffers
 * frames so history survives a closed panel or a services crash+refork).
 */

interface KeyRow {
  id: string;
  name: string;
  preview: string;
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
}

type JobRow = AgentJobFrame & { at: number };

const JOB_LABEL: Record<AgentJobFrame["event"], string> = {
  submitted: "submitted",
  succeeded: "succeeded",
  failed: "failed",
};

function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString("en-US", { hour12: false });
}

export function ForAgents() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [newName, setNewName] = useState("");
  const [ttlDays, setTtlDays] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [port, setPort] = useState<number | null>(null);
  const [jobs, setJobs] = useState<JobRow[]>([]);

  useEffect(() => {
    void refreshKeys().catch(() => setError("Could not load API keys."));
    void oia()
      .agentStatus()
      .then((s) => {
        setPort(s.port);
        setJobs(s.recentJobs);
      })
      .catch(() => setPort(null));
    const off = oia().onAgentJob((ev) => setJobs((j) => [{ ...ev, at: Date.now() }, ...j].slice(0, 50)));
    return off;
  }, []);

  async function refreshKeys() {
    setKeys(await oia().listApiKeys());
  }

  async function createKey() {
    setBusy(true); setError(""); setFreshKey(null);
    try {
      const created = await oia().createApiKey(newName, ttlDays ? Number(ttlDays) : null);
      setFreshKey(created.plaintext);
      setNewName("");
      await refreshKeys();
    } catch {
      setError("Could not create the key. Please try again.");
    } finally { setBusy(false); }
  }

  async function revoke(id: string, name: string) {
    if (!confirm(`Revoke key “${name}”? Agents using it stop working immediately.`)) return;
    try {
      await oia().revokeApiKey(id);
      await refreshKeys();
    } catch {
      setError("Could not revoke the key.");
    }
  }

  const baseUrl = port ? `http://127.0.0.1:${port}/api` : "";

  return (
    <main className="studioPage agentsView" data-testid="agents-view">
      <div className="studioTopline"><span>For agents</span><span className="privateNote">Bring Oia into your automation workflow</span></div>
      <header className="sectionHeading">
        <div>
          <h1>For Agents</h1>
          <p>Let coding agents and scripts design through your Oia, on your own machine.</p>
        </div>
      </header>

      {error && <div className="notice error" role="alert">{error}</div>}

      <section className="agentSection" aria-labelledby="keys-title">
        <h2 id="keys-title">API keys</h2>
        <p className="hintP">
          Keys authenticate against the local agent API (127.0.0.1 only). Keep them private —
          anyone with a key can start metered generations.
        </p>
        <div className="apiKeyForm">
          <input value={newName} aria-label="API key name" placeholder="Key name, e.g. claude-code" onChange={(e) => setNewName(e.target.value)} />
          <select aria-label="API key expiration" value={ttlDays} onChange={(e) => setTtlDays(e.target.value)}>
            <option value="">No expiration</option>
            <option value="30">30 days</option>
            <option value="90">90 days</option>
            <option value="365">365 days</option>
          </select>
          <button className="primaryBtn" onClick={() => void createKey()} disabled={busy || !newName.trim()}>Create key</button>
        </div>

        {freshKey && (
          <div className="freshKey" role="status">
            <b>Your new key (shown only once):</b>
            <div className="toolRow">
              <code>{freshKey}</code>
              <button className="iconBtn" aria-label="Copy new API key" title="Copy" onClick={() => void navigator.clipboard.writeText(freshKey).catch(() => {})}>Copy</button>
            </div>
          </div>
        )}

        {keys.length > 0 ? (
          <div className="tableScroll">
            <table>
              <thead>
                <tr><th style={{ width: 28 }}>#</th><th>Name</th><th>Key</th><th>Created</th><th>Expires</th><th>Last used</th><th><span className="hintP">Actions</span></th></tr>
              </thead>
              <tbody>
                {keys.map((k, i) => (
                  <tr key={k.id}>
                    <td className="muted">{i + 1}</td>
                    <td>{k.name}</td>
                    <td><code>{k.preview}…</code></td>
                    <td>{fmtDate(k.createdAt)}</td>
                    <td>{k.expiresAt ? fmtDate(k.expiresAt) : "—"}</td>
                    <td>{k.lastUsedAt ? fmtTime(k.lastUsedAt) : "—"}</td>
                    <td><button className="iconBtn danger" aria-label={`Revoke key ${k.name}`} title="Revoke key" onClick={() => void revoke(k.id, k.name)}>Revoke</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="emptyState">No API keys yet. Create a key to connect your tools.</div>
        )}
      </section>

      <section className="agentSection" aria-labelledby="base-title">
        <h2 id="base-title">Base URL</h2>
        {baseUrl ? (
          <div className="toolRow">
            <code className="baseUrlCode">{baseUrl}</code>
            <button className="iconBtn" aria-label="Copy base URL" title="Copy" onClick={() => void navigator.clipboard.writeText(baseUrl).catch(() => {})}>Copy</button>
          </div>
        ) : (
          <p className="hintP">The agent API is starting…</p>
        )}
        <p className="hintP">
          The port is chosen at launch; agent skills read it automatically from this machine.
          Point other tools at the base URL with <code>authorization: pf-…</code>.
          Envelope <code>{"{code:0, data, msg}"}</code> · task records live 24 hours.
        </p>
      </section>

      <section className="agentSection" aria-labelledby="jobs-title">
        <h2 id="jobs-title">Agent jobs</h2>
        <p className="hintP">Generations your agents started through the local API (this session).</p>
        {jobs.length > 0 ? (
          <ul className="jobList">
            {jobs.map((j, i) => (
              <li key={`${j.taskId}-${j.event}-${i}`} className={`jobRow ${j.event}`}>
                <span className="jobDot" aria-hidden="true" />
                <span className="jobType">{j.taskType}</span>
                <code className="jobId">{j.taskId}</code>
                <span className="jobEvent">{JOB_LABEL[j.event]}</span>
                <span className="muted jobAt">{fmtTime(j.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="emptyState">No agent jobs yet. Runs submitted by skills will appear here.</div>
        )}
      </section>
    </main>
  );
}
