import { useEffect, useMemo, useRef, useState } from "react";
import type { ProductFact, ProductProfile } from "@oia/schema";
import { PRODUCT_LIMITS } from "@oia/schema";
import { oia } from "../lib/bridge.js";
import { toDisplayUrl } from "../../shared/assets.js";
import type { ProductInput } from "../../shared/bridge.js";
import { ipcErrorDetail } from "../lib/ipc-error-detail.js";
import { Icons } from "../components/icons.js";

/**
 * W1.1 Products library + profile editor, first screens of the seller-workflow
 * redo. Visual reference: docs/designs/seller-workflow-canvas (SLibrary + SFacts
 * boards, Nov 2026). Honest v1: only derivable states are shown (no image-set
 * statuses yet, those arrive with W2); statuses and sale lanes are NOT faked.
 * UI copy is English (D8); product content stays whatever the seller pastes.
 */

type Filter = "all" | "no-photos";

/** Strip store-owned fields; timestamps are never inputs (bridge contract). */
function toDraft(p: ProductProfile): ProductInput {
  const { createdAt: _c, updatedAt: _u, ...draft } = { ...p, photos: [...p.photos], tags: [...p.tags], facts: [...p.facts] };
  return draft;
}

let factSeq = 0;
function newFactId(): string {
  factSeq += 1;
  return `f_${Date.now().toString(36)}_${factSeq.toString(36)}`;
}

/** Pinned locale: D8 wants English UI everywhere, a Vietnamese system locale
 *  must not leak "16 thg 11" into the table. */
function fmtDate(ms?: number): string {
  if (!ms) return "never";
  return new Date(ms).toLocaleDateString("en-GB", { day: "2-digit", month: "short" });
}

const BLANK: ProductInput = {
  id: undefined,
  name: "",
  description: "",
  photos: [],
  tags: [],
  lockNotes: "",
  facts: [],
};

export function Products() {
  const [products, setProducts] = useState<ProductProfile[] | null>(null);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [tag, setTag] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<ProductInput | null>(null);
  /** List-level errors only (load, bulk delete). The editor owns ITS errors. */
  const [msg, setMsg] = useState("");

  useEffect(() => {
    void (async () => {
      try { setProducts(await oia().listProducts()); } catch { setMsg("Could not load your products."); }
    })();
  }, []);

  const tags = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products ?? []) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [products]);

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (products ?? []).filter((p) => {
      if (filter === "no-photos" && p.photos.length > 0) return false;
      if (tag && !p.tags.includes(tag)) return false;
      if (!q) return true;
      return p.name.toLowerCase().includes(q) || p.description.toLowerCase().includes(q) || p.tags.some((t) => t.toLowerCase().includes(q));
    });
  }, [products, query, filter, tag]);

  async function refresh() {
    setProducts(await oia().listProducts());
  }

  /** The editor owns save errors; the list only learns about the outcome. */
  async function saveProduct(draft: ProductInput): Promise<{ ok: true } | { ok: false; error: string }> {
    try {
      await oia().upsertProduct(draft);
      await refresh();
      return { ok: true };
    } catch (e) {
      return { ok: false, error: ipcErrorDetail(e) || "Could not save the product." };
    }
  }

  async function removeProduct(id: string, name: string): Promise<boolean> {
    if (!confirm(`Delete product “${name}”? Its facts and photo links are removed too.`)) return false;
    try {
      await oia().removeProduct(id);
      setSelected((s) => { const n = new Set(s); n.delete(id); return n; });
      await refresh();
      return true;
    } catch {
      setMsg("Could not delete the product.");
      return false;
    }
  }

  async function removeSelected() {
    const n = selected.size;
    if (n === 0 || !confirm(`Delete ${n} product${n > 1 ? "s" : ""}? This cannot be undone.`)) return;
    setMsg("");
    let failed = 0;
    for (const id of selected) {
      try { await oia().removeProduct(id); } catch { failed += 1; }
    }
    setSelected(new Set());
    await refresh();
    if (failed > 0) setMsg(`Could not delete ${failed} of ${n} products.`);
  }

  if (editing) {
    return (
      <ProductEditor
        key={editing.id ?? "new"} /* state must never leak across two profiles */
        draft={editing}
        tagSuggestions={tags.map(([t]) => t).filter((t) => !editing.tags.includes(t)).slice(0, 12)}
        onCancel={() => setEditing(null)}
        onSave={saveProduct}
        onSaved={() => setEditing(null)}
        onDelete={editing.id ? async (id, name) => { if (await removeProduct(id, name)) setEditing(null); } : undefined}
      />
    );
  }

  const total = products?.length ?? 0;
  const noPhotos = (products ?? []).filter((p) => p.photos.length === 0).length;
  const filters: { key: Filter; label: string; n: number }[] = [
    { key: "all", label: "All", n: total },
    { key: "no-photos", label: "Needs photos", n: noPhotos },
  ];

  return (
    <section className="view productsView" aria-label="Products">
      <header className="productsHead">
        <h1>Products <span className="productsCount">{products === null ? "…" : total}</span></h1>
        <div className="productsHeadActions">
          <label htmlFor="products-search" className="visuallyHidden">Search</label>
          <input
            id="products-search"
            data-testid="products-search"
            placeholder="Search name or description"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button className="secondaryBtn" type="button" onClick={() => setEditing({ ...BLANK, photos: [], tags: [], facts: [] })} data-testid="product-new">
            {Icons.plus} Product
          </button>
        </div>
      </header>

      {msg && <div className="notice error" role="alert">{msg}</div>}
      {products === null ? (
        <p className="hintP">Loading your products…</p>
      ) : total === 0 ? (
        <div className="productsEmpty" data-testid="products-empty">
          <h2>Add your first product</h2>
          <p>Paste its listing description, drop the photos you already have, and note the facts worth putting on images. Image sets come next.</p>
          <button className="primaryBtn" type="button" onClick={() => setEditing({ ...BLANK, photos: [], tags: [], facts: [] })}>+ Product</button>
        </div>
      ) : (
        <>
          <div className="productsFilters" role="group" aria-label="Filters">
            {filters.map((f) => (
              <button
                key={f.key}
                type="button"
                className={`chip ${filter === f.key ? "active" : ""}`}
                aria-pressed={filter === f.key}
                onClick={() => setFilter(f.key)}
              >
                {f.label} <span className="pillCount">{f.n}</span>
              </button>
            ))}
            <span className="productsFiltersGap" />
            {tags.length > 0 && (
              <select aria-label="Tag" value={tag} onChange={(e) => setTag(e.target.value)}>
                <option value="">All tags</option>
                {tags.map(([t, n]) => <option key={t} value={t}>{t} ({n})</option>)}
              </select>
            )}
          </div>

          <div className="productsTable" role="table" aria-label="Product list">
            <div className="productsRow productsRowHead" role="row">
              <span role="columnheader" />
              <span role="columnheader" />
              <span role="columnheader">Product</span>
              <span role="columnheader">Tags</span>
              <span role="columnheader">Photos</span>
              <span role="columnheader">Facts</span>
              <span role="columnheader">Updated</span>
            </div>
            {rows.map((p) => (
              <div key={p.id} className={`productsRow ${selected.has(p.id) ? "sel" : ""}`} role="row" data-testid="product-row">
                <span role="cell">
                  <input
                    type="checkbox"
                    aria-label={`Select ${p.name}`}
                    checked={selected.has(p.id)}
                    onChange={() => setSelected((s) => {
                      const n = new Set(s);
                      if (n.has(p.id)) n.delete(p.id); else n.add(p.id);
                      return n;
                    })}
                  />
                </span>
                <span role="cell" className="productsThumb" aria-hidden="true">
                  {p.photos[0] ? <img src={toDisplayUrl(p.photos[0].ref)} alt="" /> : null}
                </span>
                <span role="cell" className="productsNameCell">
                  <button type="button" className="productsName" onClick={() => setEditing(toDraft(p))} data-testid="product-open">
                    <b>{p.name}</b>
                    <span className="productsDesc">{p.description.split("\n")[0].slice(0, 90)}</span>
                  </button>
                </span>
                <span role="cell" className="productsTags">{p.tags.slice(0, 3).map((t) => <span key={t} className="miniTag">{t}</span>)}</span>
                <span role="cell" className="mutedCell">{p.photos.length > 0 ? p.photos.length : <span className="warnCell">0</span>}</span>
                <span role="cell" className="mutedCell">{p.facts.filter((f) => f.kept).length}</span>
                <span role="cell" className="mutedCell">{fmtDate(p.updatedAt)}</span>
              </div>
            ))}
            {rows.length === 0 && <div className="productsNoMatch">No products match this filter.</div>}
          </div>
          <p className="hintP">Showing {rows.length} of {total}. Image sets, sales and export arrive with the next steps.</p>
        </>
      )}

      {selected.size > 0 && (
        <div className="productsSelBar" data-testid="products-selbar">
          <span>{selected.size} selected</span>
          <button className="selBarBtn danger" type="button" onClick={() => void removeSelected()}>Delete</button>
          <button className="selBarBtn ghost" type="button" onClick={() => setSelected(new Set())}>Clear</button>
        </div>
      )}
    </section>
  );
}

/** The profile editor: one screen, owner's field set exactly (W1.1), nothing structured beyond it. */
function ProductEditor({ draft, tagSuggestions, onCancel, onSave, onSaved, onDelete }: {
  draft: ProductInput;
  tagSuggestions: string[];
  onCancel: () => void;
  onSave: (draft: ProductInput) => Promise<{ ok: true } | { ok: false; error: string }>;
  /** A successful save returns to the library (the saved state is already on disk). */
  onSaved: () => void;
  onDelete?: (id: string, name: string) => void;
}) {
  const [d, setD] = useState<ProductInput>(() => ({ ...draft, photos: [...draft.photos], tags: [...draft.tags], facts: [...draft.facts] }));
  /** Dirty check basis: leaving with unsaved work must ask, never silently discard.
   *  Both sides normalized the same way (JSON drops `id: undefined`, so pin it). */
  const norm = (x: ProductInput) => JSON.stringify({ ...x, id: x.id ?? null });
  const initial = useRef(norm(draft));
  const [tagInput, setTagInput] = useState("");
  const [factText, setFactText] = useState("");
  const [factSource, setFactSource] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  function isDirty(): boolean {
    return norm(d) !== initial.current;
  }

  function tryLeave(): void {
    if (isDirty() && !confirm("Discard unsaved changes to this product?")) return;
    onCancel();
  }

  function patch(p: Partial<ProductInput>) { setD((prev) => ({ ...prev, ...p })); }

  function addTag() {
    const t = tagInput.trim();
    if (!t) return;
    if (d.tags.length >= PRODUCT_LIMITS.tags) { setErr(`At most ${PRODUCT_LIMITS.tags} tags.`); return; }
    if (!d.tags.some((x) => x.toLowerCase() === t.toLowerCase())) patch({ tags: [...d.tags, t] });
    setTagInput("");
  }

  function addFact(kind: ProductFact["source"]["kind"] = "typed") {
    const text = factText.trim();
    if (!text) return;
    if (d.facts.length >= PRODUCT_LIMITS.facts) { setErr(`At most ${PRODUCT_LIMITS.facts} facts.`); return; }
    patch({ facts: [...d.facts, { id: newFactId(), text, kept: true, source: { kind, name: factSource.trim() || (kind === "typed" ? "Typed" : "Description"), detail: "" } }] });
    setFactText(""); setFactSource("");
  }

  /** Per-file isolation: one bad upload keeps the good ones and names the failures. */
  async function uploadPhotos(files: FileList) {
    setBusy(true); setErr("");
    const room = PRODUCT_LIMITS.photos - d.photos.length;
    const list = [...files].slice(0, Math.max(0, room));
    const skipped = [...files].length - list.length;
    const photos = [...d.photos];
    const failed: string[] = [];
    for (const f of list) {
      try {
        const bytes = new Uint8Array(await f.arrayBuffer());
        const up = await oia().uploadAsset(f.name, bytes);
        photos.push({ ref: up.url, note: "" });
      } catch {
        failed.push(f.name);
      }
    }
    patch({ photos });
    const parts: string[] = [];
    if (failed.length > 0) parts.push(`Could not upload: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? ` (+${failed.length - 3} more)` : ""}`);
    if (skipped > 0) parts.push(`Kept the first ${list.length} (limit ${PRODUCT_LIMITS.photos}).`);
    if (parts.length > 0) setErr(parts.join(" "));
    setBusy(false);
  }

  function movePhoto(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= d.photos.length) return;
    const photos = [...d.photos];
    [photos[i], photos[j]] = [photos[j], photos[i]];
    patch({ photos });
  }

  async function save() {
    if (!d.name.trim()) { setErr("Name is required."); return; }
    setBusy(true); setErr("");
    const payload: ProductInput = {
      id: d.id,
      name: d.name.trim(),
      description: d.description,
      photos: d.photos,
      tags: d.tags,
      lockNotes: d.lockNotes,
      facts: d.facts,
    };
    const result = await onSave(payload);
    setBusy(false);
    if (result.ok) onSaved();
    else setErr(result.error);
  }

  return (
    <section className="view productEditor" aria-label="Product profile">
      <header className="productEditorHead">
        <button className="ghostBtn" type="button" onClick={tryLeave}>← Products</button>
        <h1>{d.name || "New product"}</h1>
        <span className="productEditorHeadGap" />
        {onDelete && d.id && (
          <button className="secondaryBtn" type="button" disabled={busy} onClick={() => onDelete(d.id!, d.name)}>Delete</button>
        )}
        <button className="primaryBtn" type="button" disabled={busy} onClick={() => void save()} data-testid="product-save">
          {busy ? "Saving…" : "Save product"}
        </button>
      </header>

      {err && <div className="notice error" role="alert">{err}</div>}

      <div className="productEditorBody">
        <div className="productCol">
          <label htmlFor="pe-name">Name</label>
          <input id="pe-name" value={d.name} maxLength={PRODUCT_LIMITS.name} placeholder="LUMA Hydra Ampoule 30ml" onChange={(e) => patch({ name: e.target.value })} />
          <label htmlFor="pe-desc">Description <span className="fieldHint">paste from the listing; price stays as text</span></label>
          <textarea
            id="pe-desc" rows={10} value={d.description} maxLength={PRODUCT_LIMITS.description}
            placeholder="Paste the listing description here; price stays as text"
            onChange={(e) => patch({ description: e.target.value })}
          />
          <label htmlFor="pe-tags">Tags</label>
          <div className="tagEditor">
            {d.tags.map((t) => (
              <span key={t} className="miniTag">
                {t}
                <button type="button" aria-label={`Remove tag ${t}`} onClick={() => patch({ tags: d.tags.filter((x) => x !== t) })}>×</button>
              </span>
            ))}
            <input
              id="pe-tags" value={tagInput} placeholder="add tag" list="pe-tag-list"
              onChange={(e) => setTagInput(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" || e.key === ",") { e.preventDefault(); addTag(); } }}
            />
            <datalist id="pe-tag-list">
              {tagSuggestions.map((t) => <option key={t} value={t} />)}
            </datalist>
          </div>
          <label htmlFor="pe-lock">Lock notes <span className="fieldHint">rules every AI edit must obey</span></label>
          <textarea id="pe-lock" rows={3} value={d.lockNotes} maxLength={PRODUCT_LIMITS.lockNotes} placeholder="Keep the logo; no extra text on the main image" onChange={(e) => patch({ lockNotes: e.target.value })} />
        </div>

        <div className="productCol">
          <h3>Photos <span className="fieldHint">first photo is the main one, order matters</span></h3>
          <div className="photoGrid" data-testid="product-photos">
            {d.photos.map((ph, i) => (
              <div key={`${ph.ref}-${i}`} className="photoTile">
                <img src={toDisplayUrl(ph.ref)} alt={`Photo ${i + 1}`} />
                {i === 0 && <span className="photoMain">Main</span>}
                <div className="photoOps">
                  <button type="button" aria-label={`Move photo ${i + 1} up`} disabled={i === 0} onClick={() => movePhoto(i, -1)}>↑</button>
                  <button type="button" aria-label={`Move photo ${i + 1} down`} disabled={i === d.photos.length - 1} onClick={() => movePhoto(i, 1)}>↓</button>
                  <button type="button" aria-label={`Remove photo ${i + 1}`} onClick={() => patch({ photos: d.photos.filter((_, j) => j !== i) })}>×</button>
                </div>
              </div>
            ))}
            {d.photos.length < PRODUCT_LIMITS.photos && (
              <button type="button" className="photoAdd" disabled={busy} onClick={() => fileRef.current?.click()} data-testid="product-add-photo">
                + Add photos
              </button>
            )}
          </div>
          <input
            ref={fileRef} type="file" accept="image/*" multiple hidden data-testid="product-photo-input"
            onChange={(e) => { const fs = e.target.files; if (fs && fs.length > 0) void uploadPhotos(fs); e.target.value = ""; }}
          />

          <h3>Facts <span className="fieldHint">what Oia may suggest as image text; each keeps its source</span></h3>
          <div className="factList" data-testid="product-facts">
            {d.facts.map((f) => (
              <div key={f.id} className={`factRow ${f.kept ? "" : "off"}`}>
                <input
                  type="checkbox" checked={f.kept} aria-label={`Keep fact: ${f.text}`}
                  onChange={() => patch({ facts: d.facts.map((x) => x.id === f.id ? { ...x, kept: !x.kept } : x) })}
                />
                <span className="factText">{f.text}</span>
                <span className="factSrc">{f.source.name}</span>
                <button type="button" aria-label={`Remove fact: ${f.text}`} onClick={() => patch({ facts: d.facts.filter((x) => x.id !== f.id) })}>×</button>
              </div>
            ))}
            {d.facts.length === 0 && <p className="hintP">No facts yet. Type the claims you want on the images (numbers, sizes, ingredients).</p>}
          </div>
          <div className="factAdd">
            <input
              value={factText} placeholder="e.g. 15,000 mg HA / 30 ml" maxLength={PRODUCT_LIMITS.factText}
              onChange={(e) => setFactText(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFact(); } }}
            />
            <input
              value={factSource} className="factSrcInput" placeholder="source (tech sheet.pdf)" maxLength={120}
              onChange={(e) => setFactSource(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addFact(); } }}
            />
            <button className="secondaryBtn" type="button" disabled={!factText.trim()} onClick={() => addFact()}>Add fact</button>
          </div>
        </div>
      </div>
    </section>
  );
}
