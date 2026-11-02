import { useEffect, useRef, useState } from "react";
import { Dialog } from "./Dialog.js";
import { ScenePreview } from "./ScenePreview.js";
import { Icons } from "./icons.js";
import { oia, bridgeErrorMessage } from "../lib/bridge.js";
import { CREATE_SIZES, projectFromImage, sizeScene } from "../lib/create-sheet.js";
import { costHintText } from "../lib/run-steps.js";
import { STUDIO_TEMPLATES } from "../lib/studio-templates.js";
import type { LiveArtboard } from "../lib/livestream-presets.js";
import { unmapAssetUrls } from "../../shared/assets.js";

/**
 * UI v1.1 R2 (UX-2) — the one place a new project starts outside the Home
 * composer. Four lanes: Describe it (hands the prompt to Home, where generation
 * runs), Start from a size, Start from a template, Bring an image. "Make its
 * text editable" hands the file to the B1 confirm dialog unchanged.
 */

interface Props {
  onClose: () => void;
  onDescribe: (prompt: string) => void;
  onOpenProject: (id: string) => void;
  onDeconstruct: (file: File) => void;
}

export function CreateSheet({ onClose, onDescribe, onOpenProject, onDeconstruct }: Props) {
  const [prompt, setPrompt] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [image, setImage] = useState<File | null>(null);
  const [isMock, setIsMock] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void oia().providerStatus().then((s) => setIsMock(s.image.capabilities.isMock)).catch(() => {});
  }, []);

  async function run(label: string, make: () => Promise<{ id: string }>) {
    setBusy(true);
    setError("");
    try {
      const p = await make();
      onOpenProject(p.id);
    } catch (e) {
      setError(bridgeErrorMessage(e, `Could not create ${label}.`));
      setBusy(false);
    }
  }

  const fromSize = (a: LiveArtboard) => void run("the project", () => oia().createProject({ name: a.projectName, scene: sizeScene(a) }));
  const featured = STUDIO_TEMPLATES.filter((t) => t.featured).slice(0, 4);

  return (
    <Dialog onClose={onClose} label="Create" wide>
      <div className="createSheet" data-testid="create-sheet">
        <h2>Create</h2>

        <section className="createLane">
          <h3>Describe it</h3>
          <form className="createDescribe" onSubmit={(e) => { e.preventDefault(); if (prompt.trim()) onDescribe(prompt.trim()); }}>
            <input aria-label="Describe your design" placeholder="A Shopee banner for a 20% milk tea sale…" value={prompt} autoFocus onChange={(e) => setPrompt(e.target.value)} />
            <button className="primaryBtn" type="submit" disabled={!prompt.trim()} aria-label="Continue on Home">→</button>
          </form>
        </section>

        <section className="createLane">
          <h3>Start from a size</h3>
          {CREATE_SIZES.map((g) => (
            <div key={g.name} className="createSizeRow">
              <span className="createSizeGroup">{g.name}</span>
              <div className="createSizeItems">
                {g.items.map((a) => (
                  <button key={a.id} className="createSize" disabled={busy} title={a.sub} onClick={() => fromSize(a)}>
                    <span>{a.label}{a.official && <span className="officialStar" aria-label="official spec" title="Official platform spec"> ★</span>}</span>
                    <small>{a.w} × {a.h}{a.transparent ? " · transparent" : ""}</small>
                  </button>
                ))}
              </div>
            </div>
          ))}
        </section>

        <section className="createLane">
          <h3>Start from a template</h3>
          <div className="createTemplates">
            {featured.map((t) => (
              <button key={t.id} className="createTemplate" disabled={busy} aria-label={`Start from ${t.name}`}
                onClick={() => void run("the project", () => oia().createProject({ name: t.name, scene: unmapAssetUrls(t.scene) }))}>
                <span className="createTemplateThumb"><ScenePreview scene={t.scene} label={t.name} /></span>
                <span>{t.name.split(" · ")[0]}</span>
              </button>
            ))}
          </div>
        </section>

        <section className="createLane">
          <h3>Bring an image</h3>
          <input ref={fileRef} type="file" accept="image/*" hidden aria-label="Bring an image" onChange={(e) => { setImage(e.target.files?.[0] ?? null); e.target.value = ""; }} />
          {!image ? (
            <button className="createPick" disabled={busy} onClick={() => fileRef.current?.click()}>{Icons.plus}Choose an image…</button>
          ) : (
            <div className="createImageChoices">
              <span className="createImageName" title={image.name}>{image.name}</span>
              <button className="createChoice" data-testid="create-image-background" disabled={busy} onClick={() => void run("the project", () => projectFromImage(image))}>
                <strong>Use as background</strong><small>free</small>
              </button>
              <button className="createChoice" data-testid="create-image-editable" disabled={busy} onClick={() => onDeconstruct(image)}>
                <strong>Make its text editable</strong>
                <small>{costHintText({ images: 1, reads: 1, isMock }) ?? "Trial · placeholder"}</small>
              </button>
              <button className="ghostBtn" onClick={() => setImage(null)}>Change</button>
            </div>
          )}
        </section>

        {busy && <p className="hintP" role="status">Creating…</p>}
        {error && <div className="notice error" role="alert">{error}</div>}
      </div>
    </Dialog>
  );
}
