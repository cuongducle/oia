import { useCallback, useEffect, useState } from "react";
import RuntimePanel from "../RuntimePanel.js";
import { ForAgents } from "./ForAgents.js";
import { oia, bridgeErrorMessage } from "../lib/bridge.js";
import { webImportSummary } from "../lib/web-import.js";

/**
 * UI v1.1 R1: Settings: the infrastructure that used to sit on the Home hero
 * (runtime panel, usage) and the developer-facing surfaces (For agents, web data
 * import) move here. Nothing new is wired: every section reuses an existing bridge
 * call or component.
 */

export type SettingsTab = "generation" | "agents" | "data";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "generation", label: "Generation" },
  { id: "agents", label: "For agents" },
  { id: "data", label: "Data & storage" },
];

interface Usage {
  images: number;
  imageLimit: number | null;
  reads: number;
  readLimit: number | null;
  failures: { file: string; failedWrites: number }[];
}

export function Settings({ initialTab = "generation", onChanged }: { initialTab?: SettingsTab; onChanged?: () => void }) {
  const [tab, setTab] = useState<SettingsTab>(initialTab);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [importing, setImporting] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    void oia()
      .providerStatus()
      .then((s) => setUsage({ images: s.quota.image, imageLimit: s.quota.limits.image, reads: s.quota.planner, readLimit: s.quota.limits.planner, failures: s.persistence }))
      .catch(() => {});
  }, []);
  useEffect(refresh, [refresh]);

  async function importFromWeb() {
    setImporting(true);
    setError("");
    setNotice("");
    try {
      const counts = await oia().importWebData(""); // empty → main opens the native folder picker
      if (counts) setNotice(webImportSummary(counts));
    } catch (e) {
      setError(bridgeErrorMessage(e, "Import failed, check the folder and try again."));
    } finally {
      setImporting(false);
    }
  }

  const pct = (n: number, limit: number | null) => (limit ? Math.min(100, Math.round((n / limit) * 100)) : null);

  return (
    <main className="settingsView" data-testid="settings-view">
      <nav className="settingsNav" aria-label="Settings sections">
        <h1>Settings</h1>
        {TABS.map((t) => (
          <button key={t.id} className={`settingsTab ${tab === t.id ? "active" : ""}`} aria-current={tab === t.id ? "page" : undefined} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </nav>

      <div className="settingsBody">
        {tab === "generation" && (
          <>
            <header className="settingsHeader">
              <h2>Generation</h2>
              <p>How Oia makes images. Your prompts and photos go to the provider you pick here.</p>
            </header>
            <RuntimePanel onModeChanged={() => { refresh(); onChanged?.(); }} />
            {usage && (
              <section className="settingsSection" aria-label="Usage today">
                <div className="settingsSectionHead"><h3>Today</h3><span>Resets at 00:00 UTC</span></div>
                <div className="usageTiles">
                  <div className="usageTile">
                    <span className="usageTileLabel">Images</span>
                    <span className="usageTileValue">{usage.images}<small>{usage.imageLimit !== null ? ` / ${usage.imageLimit}` : " no limit"}</small></span>
                    <span className="usageBar">{pct(usage.images, usage.imageLimit) !== null && <span style={{ width: `${pct(usage.images, usage.imageLimit)}%` }} />}</span>
                  </div>
                  <div className="usageTile">
                    <span className="usageTileLabel">Reads · planning &amp; text detection</span>
                    <span className="usageTileValue">{usage.reads}<small>{usage.readLimit !== null ? ` / ${usage.readLimit}` : " no limit"}</small></span>
                    <span className="usageBar">{pct(usage.reads, usage.readLimit) !== null && <span style={{ width: `${pct(usage.reads, usage.readLimit)}%` }} />}</span>
                  </div>
                </div>
                <p className="settingsNote">Counts what Oia sent to your provider. Your ChatGPT plan has its own limits on top of this.</p>
              </section>
            )}
          </>
        )}

        {tab === "agents" && <ForAgents />}

        {tab === "data" && (
          <>
            <header className="settingsHeader">
              <h2>Data &amp; storage</h2>
              <p>Projects, conversations and images live on this computer. Nothing is uploaded unless you generate.</p>
            </header>
            {usage && usage.failures.length > 0 && (
              <div className="notice warn" role="status">
                Could not save some data to disk ({usage.failures.map((f) => `${f.file} ×${f.failedWrites}`).join(", ")}). Check free space or folder permissions.
              </div>
            )}
            <section className="settingsRow">
              <div>
                <h3>Import from the web app</h3>
                <p>Bring projects, conversations, brand kits and templates from an Oia web <code>.data</code> folder. The folder is only read, never changed.</p>
              </div>
              <button className="secondaryBtn" data-testid="settings-import-web" disabled={importing} onClick={() => void importFromWeb()}>
                {importing ? "Importing…" : "Choose folder…"}
              </button>
            </section>
            {notice && <div className="notice" role="status">{notice}</div>}
            {error && <div className="notice error" role="alert">{error}</div>}
          </>
        )}
      </div>
    </main>
  );
}
