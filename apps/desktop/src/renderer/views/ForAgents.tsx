import { useCallback, useEffect, useState } from "react";
import { oia } from "../lib/bridge.js";
import type { AgentJobFrame } from "../../shared/bridge.js";

/**
 * reorg step 4d — For Agents (web /for-agents ported): API keys for the loopback
 * agent API (create/view/revoke; plaintext shown ONCE), the live base URL (the
 * port re-rolls on every utility fork), and the runs feed.
 *
 * The feed merges lifecycle frames PER TASK (a sync-mode submit settles before its
 * "submitted" frame is emitted — arrival order cannot be the display order) and
 * covers BOTH lanes: agent-API runs and quick-tools runs are all metered
 * generations and must stay visible even after the view that started them closed
 * (hard rule 6). Frames are buffered in main, so history survives a closed panel
 * or a services crash+refork.
 *
 * Copy buttons ride the MAIN-side clipboard IPC — the renderer's
 * navigator.clipboard is denied by the F2 deny-all permission handler, and a
 * swallowed failure there would silently copy nothing.
 */

interface KeyRow {
  id: string;
  name: string;
  preview: string;
  createdAt: number;
  expiresAt: number | null;
  lastUsedAt: number | null;
}

/** One row per TASK: the latest lifecycle state + when it last changed. */
interface RunRow {
  taskId: string;
  taskType: string;
  lane: AgentJobFrame["lane"];
  state: AgentJobFrame["event"];
  at: number;
}

const RUN_LABEL: Record<RunRow["state"], string> = {
  submitted: "running",
  succeeded: "succeeded",
  failed: "failed",
};

function fmtDateTime(ms: number): string {
  return new Date(ms).toLocaleString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false });
}

export function ForAgents() {
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [newName, setNewName] = useState("");
  const [ttlDays, setTtlDays] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  /** Tri-state, never a stuck "starting…" lie: ready | loading | down. */
  const [portState, setPortState] = useState<"loading" | "ready" | "down">("loading");
  const [port, setPort] = useState<number | null>(null);
  const [runs, setRuns] = useState<RunRow[]>([]);
  const [copied, setCopied] = useState<string | null>(null);

  const loadAgentStatus = useCallback(() => {
    setPortState("loading");
    void oia()
      .agentStatus()
      .then((s) => {
        setPort(s.port);
        setPortState(s.port ? "ready" : "down");
        setRuns(mergeRuns([], s.recentJobs));
      })
      .catch(() => setPortState("down"));
  }, []);

  useEffect(() => {
    void refreshKeys().catch(() => setError("Could not load API keys."));
    loadAgentStatus();
    const off = oia().onAgentJob((ev) => setRuns((prev) => mergeRuns(prev, [{ ...ev, at: Date.now() }])));
    return off;
  }, [loadAgentStatus]);

  /** Keyed merge — newest change wins per task; rows sorted by last change. */
  function mergeRuns(prev: RunRow[], incoming: (AgentJobFrame & { at: number })[]): RunRow[] {
    const byId = new Map(prev.map((r) => [r.taskId, r]));
    for (const f of incoming) {
      const existing = byId.get(f.taskId);
      if (!existing || f.at >= existing.at) {
        byId.set(f.taskId, { taskId: f.taskId, taskType: f.taskType, lane: f.lane, state: f.event, at: f.at });
      }
    }
    return [...byId.values()].sort((a, b) => b.at - a.at).slice(0, 50);
  }

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

  /** Main-side clipboard — visible confirmation, never a silent no-op. */
  async function copy(label: string, text: string) {
    setCopied(null);
    try {
      const ok = await oia().copyText(text);
      if (!ok) throw new Error("refused");
      setCopied(label);
      setTimeout(() => setCopied((c) => (c === label ? null : c)), 1600);
    } catch {
      setError("Copy failed — select the text and copy it manually.");
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
              <button className="iconBtn" aria-label="Copy new API key" title="Copy" data-copied={copied === "key" ? "1" : undefined} onClick={() => void copy("key", freshKey)}>
                {copied === "key" ? "Copied" : "Copy"}
              </button>
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
                    <td>{fmtDateTime(k.createdAt)}</td>
                    <td>{k.expiresAt ? fmtDateTime(k.expiresAt) : "—"}</td>
                    <td>{k.lastUsedAt ? fmtDateTime(k.lastUsedAt) : "—"}</td>
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
        {portState === "ready" ? (
          <div className="toolRow">
            <code className="baseUrlCode">{baseUrl}</code>
            <button className="iconBtn" aria-label="Copy base URL" title="Copy" data-copied={copied === "base" ? "1" : undefined} onClick={() => void copy("base", baseUrl)}>
              {copied === "base" ? "Copied" : "Copy"}
            </button>
          </div>
        ) : portState === "loading" ? (
          <p className="hintP" role="status">Finding the local agent API…</p>
        ) : (
          <div className="notice warn" role="status">
            The local agent API is not responding — agents cannot connect right now.
            <button className="secondaryBtn" style={{ marginLeft: 10 }} onClick={loadAgentStatus}>Retry</button>
          </div>
        )}
        <p className="hintP">
          The port is chosen at launch; agent skills read it automatically from this machine.
          Point other tools at the base URL with <code>authorization: pf-…</code>.
          Envelope <code>{"{code:0, data, msg}"}</code> · task records live 24 hours.
        </p>
      </section>

      <section className="agentSection" aria-labelledby="runs-title">
        <h2 id="runs-title">Runs</h2>
        <p className="hintP">Metered generations from agents and in-app tools (this app session), newest change first.</p>
        {runs.length > 0 ? (
          <ul className="jobList">
            {runs.map((j) => (
              <li key={j.taskId} className={`jobRow ${j.state}`}>
                <span className="jobDot" aria-hidden="true" />
                <span className={`laneTag ${j.lane}`}>{j.lane === "agent" ? "agent" : "tool"}</span>
                <span className="jobType">{j.taskType}</span>
                <code className="jobId">{j.taskId}</code>
                <span className="jobEvent">{RUN_LABEL[j.state]}</span>
                <span className="muted jobAt">{fmtDateTime(j.at)}</span>
              </li>
            ))}
          </ul>
        ) : (
          <div className="emptyState">No runs yet. Generations started by skills or the Toolbox will appear here.</div>
        )}
      </section>
    </main>
  );
}
