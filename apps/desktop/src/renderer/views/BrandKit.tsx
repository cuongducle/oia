import { useEffect, useState } from "react";
import type { BrandKit } from "@oia/schema";
import { BRANDKIT_LIMITS } from "@oia/schema";
import { oia } from "../lib/bridge.js";
import { toDisplayUrl } from "../../shared/assets.js";
import type { BrandKitInput } from "../../shared/bridge.js";

/**
 * reorg step 4d — the Brand Kit panel (web /brandkit ported, minimal): list + form
 * over BrandKitStore (tasks/brandkits.ts) through IPC. Effectiveness comes from
 * services/context.ts — runChat reads the ACTIVE kit (or an explicit brandKitId),
 * so a kit saved here reaches the next generation with zero extra wiring.
 *
 * "Design with this kit" activates it (applyByDefault) and hops to Home.
 */

interface BrandKitProps {
  onDesignWithKit: () => void;
}

const BLANK: BrandKitInput = {
  id: undefined,
  name: "Untitled brand kit",
  guidance: "",
  colors: [],
  fonts: [],
  logos: [],
  applyByDefault: false,
};

export function BrandKit({ onDesignWithKit }: BrandKitProps) {
  const [kits, setKits] = useState<BrandKit[]>([]);
  const [draft, setDraft] = useState<BrandKitInput>({ ...BLANK });
  const [color, setColor] = useState("#7050e5");
  const [font, setFont] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void refresh().catch(() => setMsg("Could not load your brand kits."));
  }, []);

  async function refresh() {
    const list = await oia().listBrandKits();
    setKits(list);
    return list;
  }

  function select(k?: BrandKit) {
    setDraft(k ? { ...k } : { ...BLANK });
    setMsg("");
  }

  async function save() {
    setBusy(true); setMsg("");
    try {
      const kit = await oia().upsertBrandKit(draft);
      setDraft({ ...kit });
      setMsg("Brand kit saved.");
      await refresh();
    } catch (e) {
      // Electron wraps handler rejections ("Error invoking remote method …: Error: <detail>")
      // — recover the LAST detail segment so store validation reaches the user
      // instead of being buried under the wrapper (never match the wrapper itself).
      const raw = e instanceof Error ? e.message : "";
      const detail = raw.includes("Error:") ? raw.slice(raw.lastIndexOf("Error:") + "Error:".length).trim() : raw;
      setMsg(detail || "Could not save the brand kit. Check the limits under each field.");
    } finally { setBusy(false); }
  }

  async function remove() {
    if (!draft.id || !confirm(`Delete brand kit “${draft.name}”?`)) return;
    setBusy(true); setMsg("");
    try {
      const ok = await oia().removeBrandKit(draft.id);
      if (!ok) throw new Error("not found");
      select();
      await refresh();
    } catch { setMsg("Could not delete the brand kit."); } finally { setBusy(false); }
  }

  async function uploadLogo(file: File) {
    setBusy(true); setMsg("");
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const up = await oia().uploadAsset(file.name, bytes);
      setDraft((d) => d.logos.length < BRANDKIT_LIMITS.logos ? { ...d, logos: [...d.logos, up.url] } : d);
    } catch { setMsg("Could not upload the logo."); } finally { setBusy(false); }
  }

  /** Activate + hop to Home — runChat picks the active kit on the next prompt. */
  async function designWithThis() {
    setBusy(true); setMsg("");
    try {
      await oia().upsertBrandKit({ ...draft, applyByDefault: true });
      await refresh();
      onDesignWithKit();
    } catch { setMsg("Could not activate the brand kit."); } finally { setBusy(false); }
  }

  const active = kits.find((k) => k.applyByDefault);

  return (
    <main className="studioPage brandkitView" data-testid="brandkit-view">
      <div className="studioTopline"><span>Brand kit</span><span className="privateNote">Your identity, consistently expressed</span></div>
      <header className="sectionHeading">
        <div>
          <h1>Brand kit</h1>
          <p>{active ? `“${active.name}” is applied to new designs.` : "No kit is applied yet — set one as default."}</p>
        </div>
        <button className="secondaryBtn" onClick={() => select()}>+ New brand kit</button>
      </header>
      <div className="kitLayout">
        <nav className="kitList" aria-label="Saved brand kits">
          {kits.map((k) => (
            <button key={k.id} className={`kitListItem ${draft.id === k.id ? "active" : ""}`} onClick={() => select(k)} aria-pressed={draft.id === k.id}>
              <span className="kitListName">{k.name}</span>
              <span className="kitSwatches">{k.colors.slice(0, 5).map((c) => <span key={c} style={{ background: c }} />)}</span>
              {k.applyByDefault && <small className="hintP">Default</small>}
            </button>
          ))}
          {kits.length === 0 && <p className="hintP">Your saved brand kits will appear here.</p>}
          <button className={`kitListItem ${!draft.id ? "active" : ""}`} onClick={() => select()}>
            <span className="kitListName">+ Create a brand kit</span>
          </button>
        </nav>
        <section className="kitFields" aria-label="Brand kit details">
          <div className="kitTitleRow">
            <input className="kitTitleInput" value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Brand kit name" />
            <label className="switchRow">
              <button role="switch" aria-label="Apply by default" aria-checked={draft.applyByDefault} className={`switch ${draft.applyByDefault ? "on" : ""}`} onClick={() => setDraft({ ...draft, applyByDefault: !draft.applyByDefault })} />
              Default
            </label>
          </div>
          <label className="field">Design guidance
            <textarea value={draft.guidance} onChange={(e) => setDraft({ ...draft, guidance: e.target.value })} maxLength={BRANDKIT_LIMITS.guidance} rows={4} placeholder="Style, voice, layout, and things to avoid…" />
            <small>{draft.guidance.length.toLocaleString("en-US")} / {BRANDKIT_LIMITS.guidance.toLocaleString("en-US")} characters · Your assistant uses this as creative direction.</small>
          </label>

          <div className="formSection">
            <h3>Logo <small>Up to {BRANDKIT_LIMITS.logos} logos</small></h3>
            <div className="logoRow">
              {draft.logos.map((u, i) => (
                <div key={u} className="logoTile">
                  <img src={toDisplayUrl(u)} alt={`Logo ${i + 1}`} />
                  <button className="iconBtn logoRemove" aria-label={`Remove logo ${i + 1}`} onClick={() => setDraft({ ...draft, logos: draft.logos.filter((x) => x !== u) })}>×</button>
                </div>
              ))}
              {draft.logos.length < BRANDKIT_LIMITS.logos && (
                <label className="logoUpload">
                  <span>Upload</span>
                  <input aria-label="Upload logo" type="file" accept="image/*" hidden disabled={busy} onChange={(e) => { if (e.target.files?.[0]) void uploadLogo(e.target.files[0]); e.target.value = ""; }} />
                </label>
              )}
            </div>
          </div>

          <div className="formSection">
            <h3>Brand colors <small>Up to {BRANDKIT_LIMITS.colors} colors</small></h3>
            <div className="toolRow">
              {draft.colors.map((c) => (
                <button key={c} aria-label={`Remove color ${c}`} title={`Remove ${c}`} onClick={() => setDraft({ ...draft, colors: draft.colors.filter((x) => x !== c) })} style={{ background: c, width: 34, height: 34, borderRadius: 8, border: "1px solid #0002" }} />
              ))}
              {draft.colors.length < BRANDKIT_LIMITS.colors && (
                <>
                  <input aria-label="Choose a color" type="color" value={color} onChange={(e) => setColor(e.target.value)} style={{ width: 44, height: 36, padding: 3 }} />
                  <button className="secondaryBtn" onClick={() => { if (!draft.colors.includes(color)) setDraft({ ...draft, colors: [...draft.colors, color] }); }}>+ Add color</button>
                </>
              )}
            </div>
          </div>

          <div className="formSection">
            <h3>Typography <small>Up to {BRANDKIT_LIMITS.fonts} fonts</small></h3>
            <div className="toolRow">
              <input aria-label="Font name" style={{ flex: 1 }} value={font} placeholder="e.g. Be Vietnam Pro" onChange={(e) => setFont(e.target.value)} />
              <button className="secondaryBtn" aria-label="Add font" disabled={draft.fonts.length >= BRANDKIT_LIMITS.fonts || !font.trim()} onClick={() => { if (!draft.fonts.includes(font.trim())) setDraft({ ...draft, fonts: [...draft.fonts, font.trim()] }); setFont(""); }}>+ Add</button>
            </div>
            <div className="toolRow" style={{ marginTop: 10 }}>
              {draft.fonts.map((f) => (
                <button key={f} className="chip" onClick={() => setDraft({ ...draft, fonts: draft.fonts.filter((x) => x !== f) })} aria-label={`Remove font ${f}`}>{f} ×</button>
              ))}
            </div>
          </div>

          <div className="toolRow kitActions">
            <button className="primaryBtn" onClick={() => void save()} disabled={busy || !draft.name.trim()}>{busy ? "Saving…" : "Save brand kit"}</button>
            {draft.id && <button className="secondaryBtn" disabled={busy} onClick={() => void designWithThis()}>Design with this kit</button>}
            {draft.id && <button className="iconBtn danger" disabled={busy} onClick={() => void remove()} aria-label="Delete brand kit" title="Delete brand kit">Delete</button>}
          </div>
          {msg && <p className="notice" role="status" style={{ margin: 0 }}>{msg}</p>}
        </section>
      </div>
    </main>
  );
}
