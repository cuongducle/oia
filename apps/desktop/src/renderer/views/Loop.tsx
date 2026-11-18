import { useEffect, useRef, useState } from "react";
import type { CanvasMsgMeta, SceneCanvas, StylePresetId } from "@oia/schema";
import { AUTO_REFINE_MAX_ROUNDS_DEFAULT, STYLE_PRESETS } from "@oia/schema";
import { stripMarkers } from "@oia/protocol";
import { CostHint } from "../components/RunSteps.js";
import { RunPanel } from "../components/RunPanel.js";
import { costHintText, stepsFromTimeline, type TimelineEntry } from "../lib/run-steps.js";
import { sizeDims } from "../lib/composer-sizes.js";
import { readAutoRefinePref, readResearchPref, readStylePref, writeStylePref } from "../lib/composer-prefs.js";
import { oia } from "../lib/bridge.js";
import { flattenScenePng } from "../lib/scene-flatten.js";
import { presentErrorEn, resetAtLabel } from "../lib/errors.js";
import type { ChatRequest } from "@oia/services";

/**
 * SIL (docs/designs/single-image-loop.md): the single-image edit loop.
 * Generate ONE image from a prompt, then (next slices) mark regions with
 * box/arrow annotations and send per-region fixes to the model, iterating on
 * the result. SL-1 ships the generate stage + Save PNG; every run joins one
 * session like Home (C1 pin), runs through the same designer pipeline with
 * pages=1 and NO outline gate: entering the loop is one click.
 *
 * UI copy is ENGLISH by owner decision (D8).
 */

const LOOP_ASPECTS: Record<string, [number, number] | null> = {
  auto: null, "1:1": [1024, 1024], "4:5": [1024, 1280], "2:3": [1024, 1536], "9:16": [1080, 1920], "16:9": [1920, 1080],
};

const HOW_IT_WORKS = "One image at a time: describe it, generate, then mark what to change next.";
const STOP_LABEL = "Stop";

const Icon = {
  arrow: <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>,
  stop: <svg width="15" height="15" viewBox="0 0 24 24"><rect x="5" y="5" width="14" height="14" rx="2.5" fill="currentColor" /></svg>,
  download: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" /></svg>,
};

/** One flat image in the session history; only real jobs push entries (B7). */
interface LoopVersion {
  dataUrl: string;
  width: number;
  height: number;
  label: string;
  jobId: string | null;
}

export function Loop() {
  const [prompt, setPrompt] = useState("");
  const [aspect, setAspect] = useState("auto");
  const [stylePreset, setStylePreset] = useState(() => readStylePref());
  const [busy, setBusy] = useState(false);
  const [jobId, setJobId] = useState<string | null>(null);
  const [timeline, setTimeline] = useState<TimelineEntry[]>([]);
  const [narrative, setNarrative] = useState("");
  const [error, setError] = useState("");
  const [mockMode, setMockMode] = useState(false);
  const [versions, setVersions] = useState<LoopVersion[]>([]);
  const [flattenFailed, setFlattenFailed] = useState("");
  const [sessionId, setSessionId] = useState<number | null>(null);
  const [notesOpen, setNotesOpen] = useState(false);
  const [genSeconds, setGenSeconds] = useState<number | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const activeJobRef = useRef<string | null>(null);
  const offRef = useRef<(() => void) | null>(null);

  /** One clock like Home (ref feeds the ✓ summary, state feeds the timer). */
  function markRunStart(ms: number | null): void {
    startedAtRef.current = ms;
    setStartedAt(ms);
  }

  useEffect(() => {
    void oia().providerStatus().then((s) => setMockMode(s.image.capabilities.isMock)).catch(() => {});
    offRef.current = oia().onChatEvent((ev) => {
      if (activeJobRef.current && ev.jobId && ev.jobId !== activeJobRef.current) return;
      if (ev.jobId) {
        activeJobRef.current ??= ev.jobId;
        setJobId(ev.jobId);
      }
      if (ev.status === "cancelled") {
        setError(presentErrorEn("cancelled").message);
        return;
      }
      if (ev.error) {
        const p = presentErrorEn(ev.errorClass);
        setError(ev.resetAt ? `${p.message} (${resetAtLabel(ev.resetAt)})` : p.message);
      }
      if (ev.renderData?.taskMeta?.length) {
        setTimeline(ev.renderData.taskMeta.map((tm) => ({ content: tm.content, done: tm.status === "1", sub: tm.type === "substep" })));
      }
      if (ev.content) setNarrative((n) => (n ? `${n}\n${stripMarkers(ev.content)}` : stripMarkers(ev.content)));
      for (const m of ev.renderData?.msgMeta ?? []) if (m.type === "canvas") {
        void adoptCanvas(m);
      }
    });
    return () => offRef.current?.();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Canvas event → the loop's flat PNG. A single job can yield SEVERAL canvas
   * events (auto refine rounds re-generate); each job owns exactly ONE version
   * slot, later candidates REPLACE the job's earlier ones (the last canvas is
   * the winner the designer yields). B7: nothing but a real job pushes history. */
  async function adoptCanvas(m: CanvasMsgMeta) {
    try {
      const flat = await flattenScenePng(m.canvas as SceneCanvas);
      setFlattenFailed("");
      const jobId = activeJobRef.current;
      setVersions((v) => {
        const last = v[v.length - 1];
        if (last && last.jobId === jobId) {
          return [...v.slice(0, -1), { ...flat, label: last.label, jobId }];
        }
        return [...v, { ...flat, label: "Generated", jobId }];
      });
      setNotesOpen(false);
      if (startedAtRef.current) setGenSeconds(Math.max(1, Math.round((Date.now() - startedAtRef.current) / 1000)));
    } catch (e) {
      setFlattenFailed(`The result could not be prepared for the loop: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  async function submit() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setNotesOpen(true);
    markRunStart(Date.now());
    setGenSeconds(null);
    activeJobRef.current = null;
    setError("");
    setFlattenFailed("");
    setTimeline([]);
    setNarrative("");
    const [w, h] = sizeDims(aspect, LOOP_ASPECTS) ?? ([1024, 1024] as [number, number]);
    const researchOn = readResearchPref();
    const autoRefineOn = readAutoRefinePref();
    const req: ChatRequest = {
      prompt,
      pages: 1,
      ...(sessionId ? { sessionId } : {}),
      ...(aspect !== "auto" ? { width: w, height: h } : {}),
      ...(researchOn ? { research: true } : {}),
      ...(stylePreset ? { style: stylePreset } : {}),
      ...(autoRefineOn ? { selfImprove: true } : {}),
    };
    try {
      const res = await oia().chatRun(req);
      setSessionId(res.sessionId);
    } catch (e) {
      const name = e instanceof Error ? e.name : "";
      if (name === "IpcValidationError") setError("Invalid request, please try again.");
      else if (name === "ProviderConfigError") setError("Provider configuration is invalid (mock mixed with real). See the README.");
      else setError(e instanceof Error ? e.message : "Something went wrong. Please try again.");
    } finally {
      setBusy(false);
    }
  }

  async function stop() {
    if (jobId) await oia().cancelChat(jobId).catch(() => {});
  }

  /** Full-resolution PNG via the native save dialog, same channel Home uses. */
  async function savePng() {
    const v = versions[versions.length - 1];
    if (!v) return;
    try {
      const blob = await (await fetch(v.dataUrl)).blob();
      await oia().saveExport("oia-loop.png", new Uint8Array(await blob.arrayBuffer()));
    } catch {
      setError("The image could not be saved. Please try again.");
    }
  }

  function startOver() {
    setVersions([]);
    setPrompt("");
    setSessionId(null);
    setNarrative("");
    setTimeline([]);
    setError("");
    setFlattenFailed("");
    setGenSeconds(null);
    markRunStart(null);
  }

  const current = versions[versions.length - 1] ?? null;
  const autoRefineOn = readAutoRefinePref();

  return (
    <main className="studioPage loopView" aria-label="Edit loop">
      <header className="loopHead">
        <h1>Edit loop</h1>
        <p>{HOW_IT_WORKS}</p>
      </header>

      <section className="promptCard loopComposer" aria-label="Generate one image">
        <textarea
          aria-label="Image idea"
          data-testid="loop-idea"
          value={prompt}
          placeholder={current ? "Describe the next image…" : "What would you like to generate?"}
          rows={2}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <div className="composerControls">
          <select aria-label="Aspect ratio" value={aspect} onChange={(e) => setAspect(e.target.value)}>
            <option value="auto">Auto ratio</option>
            {Object.keys(LOOP_ASPECTS).filter((a) => a !== "auto").map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
          <select aria-label="Style preset" data-testid="loop-style" value={stylePreset} onChange={(e) => { const v = e.target.value as StylePresetId | ""; setStylePreset(v); writeStylePref(v); }}>
            <option value="">Auto style</option>
            {STYLE_PRESETS.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
          </select>
          <span className="composerSpacer" />
          {!busy && (
            <CostHint
              testId="loop-cost"
              text={costHintText({ images: 1, isMock: mockMode, autoRefineRounds: autoRefineOn ? AUTO_REFINE_MAX_ROUNDS_DEFAULT : 0 })}
            />
          )}
          {busy ? (
            <button className="generateBtn labeled stop" aria-label={STOP_LABEL} title={STOP_LABEL} onClick={() => void stop()}>{Icon.stop}Stop</button>
          ) : (
            <button className="generateBtn labeled" aria-label="Generate image" data-testid="loop-generate" disabled={!prompt.trim()} onClick={() => void submit()}>Generate{Icon.arrow}</button>
          )}
        </div>
      </section>

      {(error || flattenFailed) && (
        <div className="notice error" role="alert">{error || flattenFailed}</div>
      )}

      {current ? (
        <section className="loopStageWrap" aria-label="Current image">
          <div className="loopStage">
            <img data-testid="loop-image" src={current.dataUrl} alt="The current loop image" width={current.width} height={current.height} />
          </div>
          <div className="loopToolbar">
            <span className="loopMeta mono">{current.width}×{current.height}{current.label ? ` · ${current.label}` : ""}{genSeconds ? ` · ${genSeconds}s` : ""}</span>
            <button className="iconBtn labeledIcon" aria-label="Save PNG" data-testid="loop-save" onClick={() => void savePng()}>{Icon.download}Save PNG</button>
            <button className="iconBtn labeledIcon" aria-label="Start over" data-testid="loop-reset" onClick={startOver}>Start over</button>
          </div>
        </section>
      ) : (
        busy && <RunPanel busy={busy} steps={stepsFromTimeline(timeline)} narrative={narrative} notesOpen={notesOpen} onToggleNotes={setNotesOpen} startedAt={startedAt} summarySeconds={genSeconds} />
      )}
    </main>
  );
}
